import { resolveTemplate } from "../utils/template.js";
import { contactFullName } from "../utils/name.js";
import { lookupFiberAvailability } from "../services/fiberLookup.js";
import { generateSalesReply } from "../voice/llm.js";
import { describeChannel } from "../services/catalogChannelLookup.js";
import { productTools } from "../services/productKnowledge.js";
import {
  OPT_OUT_GOODBYE,
  LEAD_GOODBYE,
  POLITE_GOODBYE,
} from "./defaultStagedFlow.js";
import { StagedFlowEngine } from "./stagedFlowEngine.js";
import type { StagedStage } from "./stagedFlowTypes.js";
import type { ClassificationResult } from "./graphTypes.js";

export function renderStagedText(
  engine: StagedFlowEngine,
  stage: StagedStage,
  contact: { firstName: string; familyName: string },
): string {
  const full = contactFullName(contact.firstName, contact.familyName);
  const ctx = engine.context;
  const addons = ctx.addonsSummary ? `, כולל ${ctx.addonsSummary}` : "";
  return resolveTemplate(stage.speakText ?? "", {
    customer_name: full,
    customer_full_name: full,
    customer_first_name: contact.firstName,
    customer_family_name: contact.familyName,
    package_type: ctx.packageType ?? "חבילת טריפל",
    package_price: String(ctx.packagePrice ?? 149),
    final_price: String(ctx.finalPrice ?? ctx.packagePrice ?? 149),
    addons_summary: addons,
  });
}

async function buildProductContext(
  intentId: string,
  entities?: { channel?: string; packet?: string },
): Promise<{
  channelContext?: string;
  packetContext?: string;
  internetContext?: string;
  routerContext?: string;
  optionsContext?: string;
}> {
  const channelContext = entities?.channel
    ? await describeChannel(entities.channel).then((ch) =>
        ch ? `${ch.name}: ${ch.description ?? ""}` : entities.channel,
      )
    : undefined;
  const packetContext = entities?.packet;

  if (intentId === "ask_internet") {
    const tiers = await productTools.list_internet_tiers();
    return {
      channelContext,
      packetContext,
      internetContext: tiers.map((t) => `${t.name}: ${t.downloadMbps} מגה`).join("; "),
    };
  }
  if (intentId === "ask_router_rental") {
    const router = await productTools.router_rental_info();
    return { channelContext, packetContext, routerContext: router.summaryHe };
  }
  if (intentId === "ask_options_compare") {
    const options = await productTools.compare_options();
    return { channelContext, packetContext, optionsContext: JSON.stringify(options) };
  }
  return { channelContext, packetContext };
}

export async function runSystemStage(
  engine: StagedFlowEngine,
  stage: StagedStage,
): Promise<{ advanced: boolean }> {
  if (stage.action === "fiber_availability_lookup") {
    const address = engine.context.address ?? "";
    engine.context.fiberAvailable = await lookupFiberAvailability(address);
    const nextId = engine.context.fiberAvailable ? "announce_fiber_yes" : "announce_fiber_no";
    engine.currentStageId = nextId;
    return { advanced: true };
  }
  return { advanced: false };
}

export interface StagedTurnResult {
  sayText: string;
  endCall: boolean;
  outcome?: "sold" | "refused" | "callback";
  contactStatus?: "blacklisted" | "callback" | "refused" | "pending";
  scheduleSilenceSec?: number;
}

export async function processStagedUtterance(
  engine: StagedFlowEngine,
  contact: { firstName: string; familyName: string },
  userText: string,
  classification: ClassificationResult,
): Promise<StagedTurnResult> {
  const stage = engine.getCurrentStage();
  if (!stage) {
    return { sayText: "סליחה, אירעה שגיאה בזרימה.", endCall: true };
  }

  if (classification.intentId === "opt_out_remove") {
    return {
      sayText: OPT_OUT_GOODBYE,
      endCall: true,
      outcome: "refused",
      contactStatus: "blacklisted",
    };
  }

  if (classification.intentId === "didnt_understand") {
    const repeat = engine.lastSpokenText || renderStagedText(engine, stage, contact);
    return { sayText: repeat, endCall: false, scheduleSilenceSec: stage.listen?.silenceAdvanceSec };
  }

  if (stage.interruptible !== false && engine.isProductQaIntent(classification.intentId)) {
    if (stage.id === "opening" && classification.intentId === "ask_offer") {
      // fall through to advance
    } else {
      const productCtx = await buildProductContext(classification.intentId, classification.entities);
      const reply = await generateSalesReply(userText, {
        customerFirstName: contact.firstName,
        stagePrompt: renderStagedText(engine, stage, contact),
        ...productCtx,
      });
      return {
        sayText: reply.text,
        endCall: false,
        scheduleSilenceSec: stage.listen?.silenceAdvanceSec,
      };
    }
  }

  engine.applyEntityContext(classification.intentId, classification.entities as Record<string, unknown>);

  const branch = engine.resolveBranch(stage, classification.intentId);
  if (branch) {
    if (branch.subflowId === "close_lead") {
      return {
        sayText: LEAD_GOODBYE,
        endCall: true,
        outcome: "callback",
        contactStatus: "callback",
      };
    }
    if (branch.subflowId === "close_polite") {
      return {
        sayText: POLITE_GOODBYE,
        endCall: true,
        outcome: "refused",
      };
    }
    engine.enterSubflow(branch.subflowId, branch.stageId);
    const text = await autoAdvanceSystemStages(engine, contact);
    const next = engine.getCurrentStage();
    if (!next) return { sayText: text || "נמשיך.", endCall: false };
    return {
      sayText: text,
      endCall: Boolean(next.endCall),
      outcome: next.outcome as StagedTurnResult["outcome"],
      contactStatus: next.contactStatus as StagedTurnResult["contactStatus"],
      scheduleSilenceSec: next.listen?.silenceAdvanceSec,
    };
  }

  if (engine.isAdvanceIntent(stage, classification.intentId) || classification.intentId === "silence") {
    if (stage.mergeSubflow) {
      engine.enterSubflow(stage.mergeSubflow, stage.mergeStageId ?? stage.nextStageId);
    } else {
      engine.advanceLinear(stage);
    }
    const chain = await autoAdvanceSystemStages(engine, contact);
    const next = engine.getCurrentStage();
    if (!next) return { sayText: chain || "תודה רבה.", endCall: false };
    const text = chain || (await resolveStageSpeech(engine, next, contact, userText));
    return {
      sayText: text,
      endCall: Boolean(next.endCall),
      outcome: next.outcome as StagedTurnResult["outcome"],
      contactStatus: next.contactStatus as StagedTurnResult["contactStatus"],
      scheduleSilenceSec: next.listen?.silenceAdvanceSec,
    };
  }

  const repeat = engine.lastSpokenText || renderStagedText(engine, stage, contact);
  return { sayText: repeat, endCall: false, scheduleSilenceSec: stage.listen?.silenceAdvanceSec };
}

export async function prepareStagedOpening(
  engine: StagedFlowEngine,
  contact: { firstName: string; familyName: string },
): Promise<StagedTurnResult> {
  let stage = engine.getCurrentStage();
  if (!stage) return { sayText: "שלום.", endCall: false };

  await autoAdvanceSystemStages(engine, contact);
  stage = engine.getCurrentStage();
  if (!stage) return { sayText: "שלום.", endCall: false };

  const text = await resolveStageSpeech(engine, stage, contact);
  engine.lastSpokenText = text;
  return {
    sayText: text,
    endCall: Boolean(stage.endCall),
    scheduleSilenceSec: stage.listen?.silenceAdvanceSec,
  };
}

async function autoAdvanceSystemStages(
  engine: StagedFlowEngine,
  contact: { firstName: string; familyName: string },
): Promise<string> {
  let spoken = "";
  for (let i = 0; i < 12; i++) {
    const stage = engine.getCurrentStage();
    if (!stage) break;
    if (stage.type === "system") {
      await runSystemStage(engine, stage);
      continue;
    }
    if (!engine.shouldShowStage(stage)) {
      engine.advanceLinear(stage);
      continue;
    }
    if (stage.speakText) {
      // Hard limit: at most one spoken line per auto-advance (one step per TTS turn).
      if (spoken) break;

      const part = await resolveStageSpeech(engine, stage, contact);
      spoken = part;
      if (stage.endCall) break;
      if (stage.waitForAnswer || stage.listen !== undefined) {
        break;
      }
      const autoContinue = stage.nextStageId || stage.mergeSubflow;
      if (autoContinue) {
        if (stage.mergeSubflow) {
          engine.enterSubflow(stage.mergeSubflow, stage.mergeStageId ?? stage.nextStageId);
        } else {
          engine.advanceLinear(stage);
        }
        continue;
      }
      break;
    }
    break;
  }
  return spoken;
}

async function resolveStageSpeech(
  engine: StagedFlowEngine,
  stage: StagedStage,
  contact: { firstName: string; familyName: string },
  userText?: string,
): Promise<string> {
  if (!stage.speakText) return "";
  const text = renderStagedText(engine, stage, contact);
  engine.lastSpokenText = text;
  if (stage.id === "offer_package" && userText) {
    const reply = await generateSalesReply(userText, {
      customerFirstName: contact.firstName,
      stagePrompt: text,
      nodeText: text,
    });
    return reply.text;
  }
  return text;
}

export function persistStagedEngineState(
  engine: StagedFlowEngine,
): { currentStage: string; currentSubflowId: string | null; contextJson: string } {
  return {
    currentStage: engine.currentStageId,
    currentSubflowId: engine.currentSubflowId,
    contextJson: JSON.stringify(engine.context),
  };
}

export function restoreStagedEngine(
  definition: import("./stagedFlowTypes.js").StagedFlowDefinition,
  currentStage: string | null | undefined,
  currentSubflowId: string | null | undefined,
  contextJson: string | null | undefined,
): StagedFlowEngine {
  let context: import("./stagedFlowTypes.js").CallFlowContext = {};
  try {
    context = contextJson ? (JSON.parse(contextJson) as import("./stagedFlowTypes.js").CallFlowContext) : {};
  } catch {
    context = {};
  }
  return new StagedFlowEngine(
    definition,
    currentStage ?? definition.stages[0]?.id ?? "opening",
    currentSubflowId ?? null,
    context,
  );
}
