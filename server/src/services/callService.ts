import { prisma } from "../db.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  createEngineFromFlow,
  getActiveCallFlow,
  parseCallFlow,
  previewOpeningLine,
  type CallFlowEngine,
} from "./callFlowService.js";
import {
  ensureCallable,
  getContact,
  getNextCallableContact,
  transitionContactStatus,
} from "./contactService.js";
import { getTelephonyProvider } from "./settingsService.js";
import { toE164 } from "../utils/phone.js";
import { contactFullName } from "../utils/name.js";
import { broadcastCallEvent } from "../websocket/callEvents.js";
import { generateSalesReply, detectOutcome } from "../voice/llm.js";
import { TtsSession } from "../voice/tts.js";
import { detectVoiceActivity } from "../voice/stt.js";
import { clearPlayback, registerMediaStreamCallbacks, registerVoiceHandlers, speakOnCall } from "../voice/mediaSession.js";
import { playOnTwilioCall } from "../voice/twilioPlay.js";
import { toTelephonyError } from "../telephony/errors.js";
import { logger } from "../logger.js";
import { createEngineFromGraph, GraphFlowEngine } from "../flow/graphFlowEngine.js";
import {
  getListenCheckpoint,
  isProductQaIntent,
  parseGraphContext,
  serializeGraphContext,
  speakNodeForListen,
} from "../flow/graphFlowRuntime.js";
import { OPT_OUT_GOODBYE } from "../flow/sigalMiniFlow.js";
import { lookupFiberAvailability } from "./fiberLookup.js";
import { getPublishedGraphForCall } from "./flowGraphService.js";
import { parseStagedFlow } from "../flow/stagedFlowTypes.js";
import { StagedFlowEngine } from "../flow/stagedFlowEngine.js";
import {
  persistStagedEngineState,
  prepareStagedOpening,
  processStagedUtterance,
  restoreStagedEngine,
} from "../flow/stagedFlowRuntime.js";
import {
  classifyUtterance,
  getIntentThresholds,
  persistClassification,
} from "./intentService.js";
import { describeChannel } from "./catalogChannelLookup.js";
import { productTools } from "./productKnowledge.js";
import { SOLD_GOODBYE } from "../flow/starterFlow.js";
import type { SpeakNode } from "../flow/graphTypes.js";
import type { CallOutcome, CallStatus, CallFlow, Contact } from "@prisma/client";

export type VoiceTurnResult = { sayText: string; endCall: boolean };

type SessionEngine =
  | { mode: "graph"; engine: GraphFlowEngine }
  | { mode: "linear"; engine: CallFlowEngine }
  | { mode: "staged"; engine: StagedFlowEngine };

const activeSessions = new Map<string, { tts?: TtsSession; session: SessionEngine }>();
const voiceSessionsStarted = new Set<string>();
const stagedSilenceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function templateVars(firstName: string, familyName: string) {
  const full = contactFullName(firstName, familyName);
  return {
    customer_name: full,
    customer_full_name: full,
    customer_first_name: firstName,
    agent_name: "סיגל",
  };
}

function createSessionEngine(flow: {
  stagesJson: string;
  objectionsJson: string;
  publishedGraphJson: string;
  draftGraphJson: string;
}): SessionEngine {
  const graph = getPublishedGraphForCall(flow);
  if (graph) {
    return { mode: "graph", engine: createEngineFromGraph(JSON.stringify(graph)) };
  }
  const staged = parseStagedFlow(flow.stagesJson);
  if (staged) {
    return { mode: "staged", engine: restoreStagedEngine(staged, undefined, null, "{}") };
  }
  return { mode: "linear", engine: createEngineFromFlow(flow) };
}

function clearStagedSilence(callId: string): void {
  const t = stagedSilenceTimers.get(callId);
  if (t) {
    clearTimeout(t);
    stagedSilenceTimers.delete(callId);
  }
}

function scheduleStagedSilence(callId: string, sec?: number): void {
  clearStagedSilence(callId);
  if (!sec || sec <= 0) return;
  const timer = setTimeout(() => {
    void handleStagedSilence(callId);
  }, sec * 1000);
  stagedSilenceTimers.set(callId, timer);
}

async function handleStagedSilence(callId: string): Promise<void> {
  stagedSilenceTimers.delete(callId);
  const session = activeSessions.get(callId);
  if (session?.session.mode !== "staged") return;
  await handleCustomerSpeech(callId, "");
}

async function buildChannelContext(channelName?: string): Promise<string | undefined> {
  if (!channelName) return undefined;
  const ch = await describeChannel(channelName);
  if (!ch) return channelName;
  return `${ch.name}: ${ch.description ?? "ערוץ בקטלוג YES"}. כלול ב: ${ch.packets.join(", ")}`;
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
  const channelContext = entities?.channel ? await buildChannelContext(entities.channel) : undefined;
  const packetContext = entities?.packet;

  if (intentId === "ask_internet") {
    const tiers = await productTools.list_internet_tiers();
    return {
      channelContext,
      packetContext,
      internetContext: tiers.map((t) => `${t.name}: ${t.downloadMbps} מגה, ${t.priceMonthly} ש״ח`).join("; "),
    };
  }
  if (intentId === "ask_router_rental") {
    const router = await productTools.router_rental_info();
    return { channelContext, packetContext, routerContext: router.summaryHe };
  }
  if (intentId === "ask_options_compare") {
    const options = await productTools.compare_options();
    return {
      channelContext,
      packetContext,
      optionsContext: JSON.stringify(options),
    };
  }
  return { channelContext, packetContext };
}

async function speakFromNode(
  node: SpeakNode,
  contact: { firstName: string; familyName: string },
  userMessage?: string,
  entities?: { channel?: string; packet?: string },
  intentId?: string,
): Promise<string> {
  const vars = templateVars(contact.firstName, contact.familyName);
  let text = node.text;
  text = text.replace(/\{\{(\w+)\}\}/g, (_match: string, key: string) => vars[key as keyof typeof vars] ?? "");

  if (node.useLlm || userMessage) {
    const productCtx = await buildProductContext(intentId ?? "", entities);
    const reply = await generateSalesReply(userMessage ?? text, {
      customerFirstName: contact.firstName,
      stagePrompt: text,
      nodeText: text,
      ...productCtx,
      isOpeningTurn: !userMessage,
    });
    return reply.text;
  }
  return text;
}

export async function recoverStuckContacts(): Promise<void> {
  const staleBefore = new Date(Date.now() - 2 * 60 * 1000);
  await prisma.call.updateMany({
    where: {
      status: { in: ["dialing", "ringing"] },
      startedAt: { lt: staleBefore },
    },
    data: { status: "failed", endedAt: new Date(), outcome: "no_answer" },
  });

  const stuck = await prisma.contact.findMany({
    where: { status: "in_call", deletedAt: null },
  });
  for (const contact of stuck) {
    const activeCall = await prisma.call.findFirst({
      where: {
        contactId: contact.id,
        status: { in: ["dialing", "ringing", "connected"] },
      },
    });
    if (!activeCall) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { status: "pending" },
      });
      logger.info({ contactId: contact.id }, "Recovered stuck in_call contact");
    }
  }
}

export async function startCall(contactId: string) {
  await recoverStuckContacts();

  const contact = await getContact(contactId);
  ensureCallable(contact.status);

  const flow = await getActiveCallFlow();
  const graph = getPublishedGraphForCall(flow);
  const staged = parseStagedFlow(flow.stagesJson);
  const startStageId =
    graph?.startNodeId ?? staged?.stages[0]?.id ?? JSON.parse(flow.stagesJson)[0]?.id ?? "opening";

  const call = await prisma.call.create({
    data: {
      contactId,
      flowVersionId: flow.id,
      status: "dialing",
      currentStage: startStageId,
      currentNodeId: graph ? startStageId : undefined,
      currentSubflowId: null,
      contextJson: "{}",
    },
  });

  await transitionContactStatus(contactId, "in_call");

  try {
    const provider = await getTelephonyProvider();
    const dial = await provider.dial(toE164(contact.phone), call.id);

    await prisma.call.update({
      where: { id: call.id },
      data: { externalCallId: dial.externalCallId, status: "ringing" },
    });

    broadcastCallEvent({ type: "call_status", callId: call.id, status: "ringing" });

    if (provider.name === "mock") {
      setTimeout(() => void runVoiceSession(call.id), 1500);
    }

    return prisma.call.findUnique({
      where: { id: call.id },
      include: { contact: true },
    });
  } catch (err) {
    await prisma.call.update({
      where: { id: call.id },
      data: { status: "failed", endedAt: new Date(), outcome: "none" },
    });
    await prisma.contact.update({
      where: { id: contactId },
      data: { status: "pending" },
    });
    throw toTelephonyError(err);
  }
}

export async function startNextCall() {
  const contact = await getNextCallableContact();
  if (!contact) throw new AppError(404, "אין אנשי קשר זמינים לשיחה");
  return startCall(contact.id);
}

export async function updateCallStatus(
  callId: string,
  status: CallStatus,
  outcome?: CallOutcome,
) {
  const call = await prisma.call.update({
    where: { id: callId },
    data: {
      status,
      ...(outcome ? { outcome } : {}),
      ...(status === "ended" || status === "failed" || status === "no_answer" || status === "busy"
        ? { endedAt: new Date() }
        : {}),
    },
    include: { contact: true },
  });

  broadcastCallEvent({ type: "call_status", callId, status });

  if (status === "ended" || status === "failed" || status === "no_answer" || status === "busy") {
    activeSessions.delete(callId);
    voiceSessionsStarted.delete(callId);
    clearStagedSilence(callId);
    if (call.contact.status === "in_call") {
      const fresh = await prisma.contact.findUnique({ where: { id: call.contactId } });
      if (fresh?.status !== "blacklisted") {
        const newStatus =
          outcome === "sold"
            ? "sold"
            : outcome === "refused"
              ? "refused"
              : outcome === "callback"
                ? "callback"
                : "pending";
        await transitionContactStatus(call.contactId, newStatus);
      }
    }
    broadcastCallEvent({
      type: "call_ended",
      callId,
      outcome: outcome ?? "none",
    });
  }
  return call;
}

export async function onCallConnected(callId: string): Promise<void> {
  logger.debug({ callId }, "Call in progress");
}

export async function beginOutboundVoice(callId: string): Promise<void> {
  if (voiceSessionsStarted.has(callId)) return;
  voiceSessionsStarted.add(callId);

  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { contact: true },
  });
  if (!call?.flowVersionId || !call.contact) return;

  logger.info({ callId }, "Starting outbound voice session");
  await runVoiceSession(callId);
}

async function runVoiceSession(callId: string) {
  const turn = await prepareInitialVoiceTurn(callId);
  const tts = new TtsSession();
  const session = activeSessions.get(callId);
  if (session) session.tts = tts;
  await speakOnCall(callId, turn.sayText, tts);

  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (call?.externalCallId?.startsWith("mock-")) {
    await finalizeCall(callId, "sold");
  }
}

export async function prepareInitialVoiceTurn(callId: string): Promise<VoiceTurnResult> {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { contact: true, callFlow: true },
  });
  if (!call?.flowVersionId || !call.contact || !call.callFlow) {
    return { sayText: "שלום.", endCall: true };
  }

  await updateCallStatus(callId, "connected");

  const sessionEngine = createSessionEngine(call.callFlow);
  if (call.currentNodeId && sessionEngine.mode === "graph") {
    sessionEngine.engine.currentNodeId = call.currentNodeId;
  }
  if (sessionEngine.mode === "staged") {
    const staged = parseStagedFlow(call.callFlow.stagesJson);
    if (staged) {
      sessionEngine.engine = restoreStagedEngine(
        staged,
        call.currentStage,
        call.currentSubflowId,
        call.contextJson,
      );
    }
  } else if (call.currentStage && sessionEngine.mode === "linear") {
    sessionEngine.engine.currentStageId = call.currentStage;
  }
  activeSessions.set(callId, { session: sessionEngine });

  let sayText = "שלום.";
  let scheduleSilenceSec: number | undefined;
  let graphContext = parseGraphContext(call.contextJson);

  if (sessionEngine.mode === "staged") {
    const opening = await prepareStagedOpening(sessionEngine.engine, call.contact);
    sayText = opening.sayText;
    scheduleSilenceSec = opening.scheduleSilenceSec;
  } else if (sessionEngine.mode === "graph") {
    const node = sessionEngine.engine.getCurrentNode();
    if (node?.type === "speak") {
      sayText = await speakFromNode(node, call.contact);
      graphContext.lastSpokenText = sayText;
      const edge = sessionEngine.engine.getNextAutoEdge(node.id);
      if (edge) {
        sessionEngine.engine.currentNodeId = edge.target;
      }
    }
  } else {
    const parsed = parseCallFlow(call.callFlow);
    const opening = previewOpeningLine(
      parsed.openingTemplate,
      contactFullName(call.contact.firstName, call.contact.familyName),
    );
    const stage = sessionEngine.engine.getCurrentStage();
    let body = opening;
    if (stage) {
      const reply = await generateSalesReply(stage.prompt, {
        customerFirstName: call.contact.firstName,
        stagePrompt: stage.prompt,
        isOpeningTurn: true,
      });
      body = `${opening} ${reply.text}`;
    }
    sayText = body;
  }

  const persistData =
    sessionEngine.mode === "staged"
      ? persistStagedEngineState(sessionEngine.engine)
      : sessionEngine.mode === "linear"
        ? { currentStage: sessionEngine.engine.currentStageId }
        : {
            currentNodeId: sessionEngine.engine.currentNodeId,
            currentStage: sessionEngine.engine.currentNodeId,
            contextJson: serializeGraphContext(graphContext),
          };

  await prisma.call.update({
    where: { id: callId },
    data: persistData,
  });

  await addTranscript(callId, "ai", sayText);
  broadcastCallEvent({ type: "transcript", callId, speaker: "ai", text: sayText });
  scheduleStagedSilence(callId, scheduleSilenceSec);

  return { sayText, endCall: false };
}

export async function kickoffInitialVoice(callId: string): Promise<void> {
  try {
    const turn = await prepareInitialVoiceTurn(callId);
    const played = await playOnTwilioCall(callId, turn.sayText, turn.endCall);
    if (!played && !turn.endCall) {
      logger.warn({ callId }, "Initial ElevenLabs play failed — call stays connected on hold");
    }
  } catch (err) {
    logger.error({ err, callId }, "kickoffInitialVoice failed");
  }
}

export async function processCustomerTurn(callId: string, text: string): Promise<VoiceTurnResult> {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { contact: true, callFlow: true },
  });
  if (!call?.callFlow || !call.contact) {
    return { sayText: "סליחה, אירעה שגיאה.", endCall: true };
  }

  clearStagedSilence(callId);

  const isSilence = text.trim() === "";
  const classification = isSilence
    ? {
        intentId: "silence",
        confidence: 1,
        entities: {},
        classifier: "rule" as const,
      }
    : await classifyUtterance(text, {
        currentNodeId: call.currentNodeId ?? undefined,
        awaitingRefusalConfirm:
          call.currentNodeId === "listen_confirm" || call.currentNodeId === "route_confirm",
      });

  if (!isSilence) {
    const segment = await addTranscript(callId, "customer", text);
    broadcastCallEvent({ type: "transcript", callId, speaker: "customer", text });
    await persistClassification(segment.id, callId, classification);
    broadcastCallEvent({
      type: "classification",
      callId,
      segmentId: segment.id,
      intentId: classification.intentId,
      confidence: classification.confidence,
    });
  }

  let session = activeSessions.get(callId);
  if (!session) {
    const sessionEngine = createSessionEngine(call.callFlow);
    if (call.currentNodeId && sessionEngine.mode === "graph") {
      sessionEngine.engine.currentNodeId = call.currentNodeId;
    } else if (sessionEngine.mode === "staged") {
      const staged = parseStagedFlow(call.callFlow.stagesJson);
      if (staged) {
        sessionEngine.engine = restoreStagedEngine(
          staged,
          call.currentStage,
          call.currentSubflowId,
          call.contextJson,
        );
      }
    } else if (call.currentStage && sessionEngine.mode === "linear") {
      sessionEngine.engine.currentStageId = call.currentStage;
    }
    session = { session: sessionEngine };
    activeSessions.set(callId, session);
  }

  if (session.session.mode === "staged") {
    return processStagedTurn(callId, call as CallWithRelations, session.session.engine, text, classification);
  }

  if (session.session.mode === "graph") {
    return processGraphTurn(callId, call as CallWithRelations, session.session.engine, text, classification);
  }

  return processLinearTurn(callId, call as CallWithRelations, session.session.engine, text);
}

type CallWithRelations = {
  id: string;
  contactId: string;
  contextJson: string;
  contact: Contact;
  callFlow: CallFlow;
};

async function processStagedTurn(
  callId: string,
  call: CallWithRelations,
  engine: StagedFlowEngine,
  text: string,
  classification: Awaited<ReturnType<typeof classifyUtterance>>,
): Promise<VoiceTurnResult> {
  const result = await processStagedUtterance(engine, call.contact, text, classification);

  await prisma.call.update({
    where: { id: callId },
    data: persistStagedEngineState(engine),
  });

  if (result.contactStatus === "blacklisted") {
    await prisma.contact.update({
      where: { id: call.contactId },
      data: { status: "blacklisted" },
    });
  } else if (result.contactStatus === "callback") {
    await transitionContactStatus(call.contactId, "callback");
  }

  await addTranscript(callId, "ai", result.sayText);
  broadcastCallEvent({ type: "transcript", callId, speaker: "ai", text: result.sayText });

  if (result.endCall) {
    const outcome = result.outcome ?? "none";
    if (outcome !== "none") {
      await finalizeCall(callId, outcome);
    } else {
      await updateCallStatus(callId, "ended", "none");
    }
    return { sayText: result.sayText, endCall: true };
  }

  scheduleStagedSilence(callId, result.scheduleSilenceSec);
  return { sayText: result.sayText, endCall: false };
}

async function processGraphTurn(
  callId: string,
  call: CallWithRelations,
  engine: GraphFlowEngine,
  text: string,
  classification: Awaited<ReturnType<typeof classifyUtterance>>,
): Promise<VoiceTurnResult> {
  const thresholds = await getIntentThresholds();
  const ctx = parseGraphContext(call.contextJson);

  if (classification.intentId === "opt_out_remove") {
    const sayText = OPT_OUT_GOODBYE;
    await prisma.contact.update({
      where: { id: call.contactId },
      data: { status: "blacklisted" },
    });
    await addTranscript(callId, "ai", sayText);
    broadcastCallEvent({ type: "transcript", callId, speaker: "ai", text: sayText });
    await finalizeCall(callId, "refused");
    return { sayText, endCall: true };
  }

  if (classification.intentId === "didnt_understand") {
    const sayText = ctx.lastSpokenText || "אשמח לחזור על השאלה.";
    await prisma.call.update({
      where: { id: callId },
      data: {
        currentNodeId: engine.currentNodeId,
        currentStage: engine.currentNodeId,
        contextJson: serializeGraphContext(ctx),
      },
    });
    await addTranscript(callId, "ai", sayText);
    broadcastCallEvent({ type: "transcript", callId, speaker: "ai", text: sayText });
    return { sayText, endCall: false };
  }

  if (isProductQaIntent(classification.intentId)) {
    const listenId = getListenCheckpoint(engine);
    const speakNode = listenId ? speakNodeForListen(engine, listenId) : undefined;
    const stagePrompt =
      speakNode?.text.replace(/\{\{(\w+)\}\}/g, (_m, key) => {
        const vars = templateVars(call.contact.firstName, call.contact.familyName);
        return vars[key as keyof typeof vars] ?? "";
      }) ?? "";
    const productCtx = await buildProductContext(classification.intentId, classification.entities);
    const reply = await generateSalesReply(text, {
      customerFirstName: call.contact.firstName,
      stagePrompt,
      ...productCtx,
    });
    await prisma.call.update({
      where: { id: callId },
      data: {
        currentNodeId: engine.currentNodeId,
        currentStage: engine.currentNodeId,
        contextJson: serializeGraphContext(ctx),
      },
    });
    await addTranscript(callId, "ai", reply.text);
    broadcastCallEvent({ type: "transcript", callId, speaker: "ai", text: reply.text });
    return { sayText: reply.text, endCall: false };
  }

  let routedClassification = classification;
  if (classification.intentId === "provide_address") {
    const address =
      (classification.entities as { address?: string }).address ?? text.trim();
    const available = await lookupFiberAvailability(address);
    routedClassification = {
      ...classification,
      intentId: available ? "fiber_available" : "fiber_unavailable",
      confidence: 1,
    };
  }

  engine.advanceFromListen();
  let node = engine.getCurrentNode();
  if (node?.type === "intent_route" || node?.type === "decision") {
    node = engine.advanceByClassification(routedClassification, thresholds) ?? undefined;
  }

  let sayText = ctx.lastSpokenText || "אשמח להמשיך לעזור לך.";

  if (node?.type === "speak") {
    sayText = await speakFromNode(
      node,
      call.contact,
      text,
      classification.entities,
      classification.intentId,
    );
    ctx.lastSpokenText = sayText;
    const edge = engine.getNextAutoEdge(node.id);
    if (edge) {
      engine.currentNodeId = edge.target;
      node = engine.getCurrentNode();
    }
  }

  if (node?.type === "speak" && node.id.startsWith("goodbye_")) {
    sayText = await speakFromNode(node, call.contact);
    ctx.lastSpokenText = sayText;
    const edge = engine.getNextAutoEdge(node.id);
    if (edge) {
      engine.currentNodeId = edge.target;
      node = engine.getCurrentNode();
    }
  }

  if (engine.isEndNode(node)) {
    const outcome = node.outcome ?? "none";
    if (node.id === "end_blacklist") {
      await prisma.contact.update({
        where: { id: call.contactId },
        data: { status: "blacklisted" },
      });
    } else if (node.id === "end_callback" || outcome === "callback") {
      await transitionContactStatus(call.contactId, "callback");
    }

    await prisma.call.update({
      where: { id: callId },
      data: {
        currentNodeId: engine.currentNodeId,
        currentStage: engine.currentNodeId,
        contextJson: serializeGraphContext(ctx),
      },
    });
    await addTranscript(callId, "ai", sayText);
    broadcastCallEvent({ type: "transcript", callId, speaker: "ai", text: sayText });

    const endOutcome =
      outcome === "sold" || outcome === "refused" || outcome === "callback" ? outcome : "none";
    if (endOutcome !== "none") {
      await finalizeCall(callId, endOutcome);
    } else {
      await updateCallStatus(callId, "ended", "none");
    }
    return { sayText, endCall: true };
  }

  await prisma.call.update({
    where: { id: callId },
    data: {
      currentNodeId: engine.currentNodeId,
      currentStage: engine.currentNodeId,
      contextJson: serializeGraphContext(ctx),
    },
  });

  await addTranscript(callId, "ai", sayText);
  broadcastCallEvent({ type: "transcript", callId, speaker: "ai", text: sayText });
  return { sayText, endCall: false };
}

async function processLinearTurn(
  callId: string,
  call: CallWithRelations,
  engine: CallFlowEngine,
  text: string,
): Promise<VoiceTurnResult> {
  const stage = engine.getCurrentStage();
  const reply = await generateSalesReply(text, {
    customerFirstName: call.contact.firstName,
    stagePrompt: stage?.prompt ?? "",
  });

  const outcome = reply.outcome ?? detectOutcome(text);

  if (outcome === "refused" || outcome === "sold" || outcome === "callback") {
    const closingText = outcome === "sold" ? SOLD_GOODBYE : reply.text;
    await addTranscript(callId, "ai", closingText);
    broadcastCallEvent({ type: "transcript", callId, speaker: "ai", text: closingText });
    await finalizeCall(callId, outcome);
    return { sayText: closingText, endCall: true };
  }

  engine.markSpokenOffset(engine.currentStageId, 0);
  const next = engine.advance();
  await prisma.call.update({
    where: { id: callId },
    data: { currentStage: next?.id ?? engine.currentStageId },
  });

  await addTranscript(callId, "ai", reply.text);
  broadcastCallEvent({ type: "transcript", callId, speaker: "ai", text: reply.text });
  return { sayText: reply.text, endCall: false };
}

export async function handleCustomerSpeech(callId: string, text: string) {
  const session = activeSessions.get(callId);
  session?.tts?.abort();
  clearPlayback(callId);
  clearStagedSilence(callId);

  const turn = await processCustomerTurn(callId, text);

  const call = await prisma.call.findUnique({ where: { id: callId } });
  const isTwilio =
    call?.externalCallId && !call.externalCallId.startsWith("mock-");

  if (isTwilio) {
    await playOnTwilioCall(callId, turn.sayText, turn.endCall);
    return;
  }

  if (turn.endCall) return;

  const replyTts = new TtsSession();
  const updated = activeSessions.get(callId);
  if (updated) updated.tts = replyTts;
  await speakOnCall(callId, turn.sayText, replyTts);
}

export async function handleBargeIn(callId: string, audioChunk: Buffer) {
  if (!detectVoiceActivity(audioChunk)) return;
  const session = activeSessions.get(callId);
  if (session?.tts && !session.tts.isAborted()) {
    session.tts.abort();
    clearPlayback(callId);
    logger.info({ callId }, "Barge-in: TTS cancelled");
  }
}

export async function addTranscript(callId: string, speaker: string, text: string) {
  return prisma.callTranscriptSegment.create({
    data: { callId, speaker, text },
  });
}

export async function finalizeCall(callId: string, outcome: CallOutcome) {
  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call) return;

  const segments = await prisma.callTranscriptSegment.findMany({
    where: { callId },
    orderBy: { timestamp: "asc" },
    include: { classification: { include: { intent: true } } },
  });
  const intents = segments
    .filter((s) => s.classification)
    .map((s) => s.classification!.intent.labelHe)
    .join(", ");
  const summary = `תוצאה: ${outcome}. ${segments.length} קטעי שיחה. כוונות: ${intents || "—"}.`;
  const durationSec = Math.floor((Date.now() - call.startedAt.getTime()) / 1000);

  await prisma.call.update({
    where: { id: callId },
    data: { outcome, summary, status: "ended", endedAt: new Date(), durationSec },
  });
  await updateCallStatus(callId, "ended", outcome);
}

export async function listCalls(params: { page?: number; pageSize?: number } = {}) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const [items, total] = await Promise.all([
    prisma.call.findMany({
      include: { contact: true },
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.call.count(),
  ]);
  return { items, total, page, pageSize };
}

export async function getCall(id: string) {
  const call = await prisma.call.findUnique({
    where: { id },
    include: {
      contact: true,
      transcript: {
        orderBy: { timestamp: "asc" },
        include: {
          classification: { include: { intent: true } },
        },
      },
    },
  });
  if (!call) throw new AppError(404, "שיחה לא נמצאה");
  return call;
}

export async function getActiveCall() {
  return prisma.call.findFirst({
    where: { status: { in: ["dialing", "ringing", "connected"] } },
    include: {
      contact: true,
      transcript: {
        orderBy: { timestamp: "asc" },
        include: {
          classification: { include: { intent: true } },
        },
      },
    },
  });
}

registerVoiceHandlers({
  onCustomerSpeech: handleCustomerSpeech,
  onBargeIn: handleBargeIn,
});

registerMediaStreamCallbacks({
  onStreamStart: async (callId) => {
    voiceSessionsStarted.add(callId);
    logger.info({ callId }, "Twilio media stream ready — Deepgram Hebrew STT active");
  },
});
