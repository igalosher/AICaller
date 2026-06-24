import type { ContactSex } from "@prisma/client";
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
import { getTelephonyConfig, getTelephonyProvider } from "./settingsService.js";
import { toE164 } from "../utils/phone.js";
import { contactFullName } from "../utils/name.js";
import { broadcastCallEvent } from "../websocket/callEvents.js";
import { generateSalesReply, detectOutcome } from "../voice/llm.js";
import { TtsSession } from "../voice/tts.js";
import { detectVoiceActivity } from "../voice/stt.js";
import { clearPlayback, registerMediaStreamCallbacks, registerVoiceHandlers, speakOnCall, unregisterMediaStream, waitForMediaSession } from "../voice/mediaSession.js";
import {
  disconnectBrowserTestCall,
  hasBrowserSession,
  registerBrowserTestHandlers,
  speakToBrowser,
  stopBrowserPlayback,
  unregisterBrowserSession,
} from "../voice/browserTestSession.js";
import { hangupTwilioCall } from "../voice/twilioPlay.js";
import { createPlayClip } from "../voice/playAudio.js";
import { playOnTwilioCall, playPreloadedOnTwilioCall } from "../voice/twilioPlay.js";
import { toTelephonyError } from "../telephony/errors.js";
import { ensureTwilioWebhookReady } from "../telephony/tunnelManager.js";
import { logger } from "../logger.js";
import { createEngineFromGraph, GraphFlowEngine } from "../flow/graphFlowEngine.js";
import {
  getListenCheckpoint,
  getListenScopedIntentIds,
  initGraphContext,
  parseGraphContext,
  resolveListenIdFromPosition,
  serializeGraphContext,
  isMainPathAnswer,
  shouldInterruptQa,
  speakNodeForListen,
} from "../flow/graphFlowRuntime.js";
import {
  collectSideFlowSpeakNodes,
  isInSideFlow,
  shouldEnterSideFlow,
} from "../flow/sideFlowRuntime.js";
import { applyListenBindings, flowVariablesForTemplate } from "../flow/variableBinding.js";
import { mergeTemplateVars, resolveTemplate } from "../utils/template.js";
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
  type ClassifyOptions,
} from "./intentService.js";
import { describeChannel } from "./catalogChannelLookup.js";
import { productTools } from "./productKnowledge.js";
import { SOLD_GOODBYE } from "../flow/starterFlow.js";
import type { SpeakNode } from "../flow/graphTypes.js";
import type { StagedFlowDefinition, StagedStage } from "../flow/stagedFlowTypes.js";
import type { CallOutcome, CallStatus, CallFlow, Contact } from "@prisma/client";

export type VoiceTurnResult = { sayText: string; endCall: boolean };

type SessionEngine =
  | { mode: "graph"; engine: GraphFlowEngine }
  | { mode: "linear"; engine: CallFlowEngine }
  | { mode: "staged"; engine: StagedFlowEngine };

const activeSessions = new Map<string, { tts?: TtsSession; session: SessionEngine }>();
const voiceSessionsStarted = new Set<string>();
const stagedSilenceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const preloadedOpeningClips = new Map<string, { clipId: string; sayText: string }>();

export function peekPreloadedOpening(callId: string): { clipId: string; sayText: string } | undefined {
  return preloadedOpeningClips.get(callId);
}

export function isTestCall(externalCallId: string | null | undefined): boolean {
  return Boolean(externalCallId?.startsWith("test-"));
}

function templateVars(firstName: string, familyName: string, sex: ContactSex = "male") {
  const full = contactFullName(firstName, familyName);
  return {
    customer_name: full,
    customer_full_name: full,
    customer_first_name: firstName,
    customer_sex: sex,
    agent_name: "סיגל",
  };
}

type ContactForSpeech = { firstName: string; familyName: string; sex: ContactSex };

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

function findStagedStage(
  def: StagedFlowDefinition,
  stageId: string,
  subflowId: string | null,
): StagedStage | undefined {
  if (subflowId) {
    return def.subflows[subflowId]?.stages.find((s) => s.id === stageId);
  }
  return def.stages.find((s) => s.id === stageId);
}

function classifyOptionsForCall(
  call: {
    currentNodeId: string | null;
    currentStage: string | null;
    currentSubflowId: string | null;
    callFlow: {
      stagesJson: string;
      publishedGraphJson: string;
      draftGraphJson: string;
    };
  },
  session?: SessionEngine,
): ClassifyOptions {
  const options: ClassifyOptions = {
    currentNodeId: call.currentNodeId ?? undefined,
    awaitingRefusalConfirm:
      call.currentNodeId === "listen_confirm" || call.currentNodeId === "route_confirm",
  };
  const graph = getPublishedGraphForCall(call.callFlow);
  if (graph) {
    let listenId =
      session?.mode === "graph"
        ? getListenCheckpoint(session.engine)
        : null;
    if (!listenId) {
      listenId = resolveListenIdFromPosition(graph, call.currentNodeId);
    }
    if (listenId) {
      options.scopedAnswerIntents = getListenScopedIntentIds(graph, listenId);
    }
  } else {
    const staged = parseStagedFlow(call.callFlow.stagesJson);
    if (staged && call.currentStage) {
      const stage = findStagedStage(staged, call.currentStage, call.currentSubflowId);
      if (stage?.advanceOn?.length && (stage.waitForAnswer || stage.listen)) {
        options.scopedAnswerIntents = stage.advanceOn;
      }
    }
  }
  return options;
}

function resolveSpeakPrompt(
  speakNode: SpeakNode | undefined,
  contact: ContactForSpeech,
  variables: Record<string, unknown>,
): string {
  if (!speakNode?.text) return "";
  return resolveTemplate(
    speakNode.text,
    mergeTemplateVars(
      templateVars(contact.firstName, contact.familyName, contact.sex),
      flowVariablesForTemplate(variables),
    ),
  );
}

async function persistGraphTurn(
  callId: string,
  engine: GraphFlowEngine,
  ctx: ReturnType<typeof parseGraphContext>,
  sayText: string,
): Promise<void> {
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
}

async function runSideFlowEntry(
  callId: string,
  call: CallWithRelations,
  engine: GraphFlowEngine,
  listenId: string,
  sideFlow: { entryNodeId: string },
  ctx: ReturnType<typeof parseGraphContext>,
  classification: Awaited<ReturnType<typeof classifyUtterance>>,
  text: string,
): Promise<VoiceTurnResult> {
  const graph = engine.getGraph();
  const speakNode = speakNodeForListen(engine, listenId);
  const stagePrompt =
    resolveSpeakPrompt(speakNode, call.contact, ctx.variables ?? {}) ||
    ctx.lastSpokenText ||
    "";

  ctx.mainCheckpoint = {
    listenNodeId: listenId,
    resumeNodeId: listenId,
    lastSpokenText: stagePrompt,
  };

  const speaks = collectSideFlowSpeakNodes(graph, sideFlow.entryNodeId);
  const spokenParts: string[] = [];
  for (let i = 0; i < speaks.length; i++) {
    const sn = speaks[i]!;
    const part = await speakFromNode(
      sn,
      call.contact,
      sn.useLlm && i === 0 ? text : undefined,
      sn.useLlm && i === 0 ? classification.entities : undefined,
      sn.useLlm && i === 0 ? classification.intentId : undefined,
      ctx.variables,
    );
    spokenParts.push(part);
  }

  const lastSpeak = speaks[speaks.length - 1];
  let sayText = spokenParts.join(" ");

  if (lastSpeak?.returnsToMain && ctx.mainCheckpoint) {
    engine.currentNodeId = ctx.mainCheckpoint.resumeNodeId;
    const repeat = ctx.mainCheckpoint.lastSpokenText;
    sayText = `${sayText} ${repeat}`.trim();
    ctx.lastSpokenText = repeat;
    delete ctx.mainCheckpoint;
  } else if (lastSpeak) {
    engine.currentNodeId = lastSpeak.id;
    const edge = engine.getNextAutoEdge(lastSpeak.id);
    if (edge) {
      const next = graph.nodes.find((n) => n.id === edge.target);
      if (next) engine.currentNodeId = next.id;
    }
    ctx.lastSpokenText = spokenParts[spokenParts.length - 1]!;
  }

  await persistGraphTurn(callId, engine, ctx, sayText);
  return { sayText, endCall: false };
}

function restoreMainAfterSideFlow(
  engine: GraphFlowEngine,
  ctx: ReturnType<typeof parseGraphContext>,
  spokenParts: string[],
): string | undefined {
  if (!ctx.mainCheckpoint) return undefined;
  engine.currentNodeId = ctx.mainCheckpoint.resumeNodeId;
  const repeat = ctx.mainCheckpoint.lastSpokenText;
  delete ctx.mainCheckpoint;
  const sayText = [...spokenParts, repeat].join(" ").trim();
  ctx.lastSpokenText = repeat;
  return sayText;
}

async function speakFromNode(
  node: SpeakNode,
  contact: ContactForSpeech,
  userMessage?: string,
  entities?: { channel?: string; packet?: string },
  intentId?: string,
  flowVariables?: Record<string, unknown>,
): Promise<string> {
  const vars = mergeTemplateVars(
    templateVars(contact.firstName, contact.familyName, contact.sex),
    flowVariablesForTemplate(flowVariables ?? {}),
  );
  let text = resolveTemplate(node.text, vars);

  if (node.useLlm) {
    const productCtx = await buildProductContext(intentId ?? "", entities);
    const isOpening = !userMessage && /opening/i.test(node.id);
    const reply = await generateSalesReply(userMessage ?? text, {
      customerFirstName: contact.firstName,
      customerSex: contact.sex,
      stagePrompt: text,
      nodeText: text,
      ...productCtx,
      isOpeningTurn: isOpening,
      repeatQuestion: userMessage ? text : undefined,
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

  const staleTestCalls = await prisma.call.findMany({
    where: {
      status: "connected",
      externalCallId: { startsWith: "test-" },
      startedAt: { lt: staleBefore },
    },
  });
  for (const call of staleTestCalls) {
    await updateCallStatus(call.id, "ended", "none");
    unregisterBrowserSession(call.id);
    activeSessions.delete(call.id);
    voiceSessionsStarted.delete(call.id);
    logger.info({ callId: call.id }, "Ended stale browser test call");
  }

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

async function endActiveTestCallsForContact(contactId: string): Promise<void> {
  const activeTestCalls = await prisma.call.findMany({
    where: {
      contactId,
      status: { in: ["dialing", "ringing", "connected"] },
      externalCallId: { startsWith: "test-" },
    },
  });
  for (const call of activeTestCalls) {
    await updateCallStatus(call.id, "ended", "none");
    unregisterBrowserSession(call.id);
    activeSessions.delete(call.id);
    voiceSessionsStarted.delete(call.id);
    logger.info({ callId: call.id, contactId }, "Ended prior browser test call for new test");
  }
}

async function preloadOpeningAudio(
  callId: string,
  contact: Contact,
  flow: CallFlow,
  graph: ReturnType<typeof getPublishedGraphForCall>,
  startNodeId: string,
  initialContext: string,
): Promise<void> {
  try {
    let sayText = "שלום.";
    if (graph) {
      const engine = createEngineFromGraph(JSON.stringify(graph), startNodeId);
      const graphContext = parseGraphContext(initialContext);
      const node = engine.getCurrentNode();
      if (node?.type === "speak") {
        sayText = await speakFromNode(
          node,
          contact,
          undefined,
          undefined,
          undefined,
          graphContext.variables,
        );
      }
    } else {
      const parsed = parseCallFlow(flow);
      sayText = previewOpeningLine(
        parsed.openingTemplate,
        contactFullName(contact.firstName, contact.familyName),
      );
    }

    const clipId = await createPlayClip(sayText, { addresseeSex: contact.sex });
    if (clipId) {
      preloadedOpeningClips.set(callId, { clipId, sayText });
      logger.info({ callId }, "Preloaded opening audio before dial");
    }
  } catch (err) {
    logger.warn({ err, callId }, "Opening preload failed — will synthesize on answer");
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
  const initialContext =
    graph ? serializeGraphContext(initGraphContext(graph)) : "{}";

  const call = await prisma.call.create({
    data: {
      contactId,
      flowVersionId: flow.id,
      status: "dialing",
      currentStage: startStageId,
      currentNodeId: graph ? startStageId : undefined,
      currentSubflowId: null,
      contextJson: initialContext,
    },
  });

  await transitionContactStatus(contactId, "in_call");

  try {
    const telephonyConfig = await getTelephonyConfig();
    if (telephonyConfig.provider === "twilio") {
      await ensureTwilioWebhookReady();
      await preloadOpeningAudio(call.id, contact, flow, graph, startStageId, initialContext);
    }
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

/** Local test call — same flow/runtime as a real call, but audio via browser mic/speaker (no Twilio). */
export async function startTestCall(contactId: string) {
  await recoverStuckContacts();
  await endActiveTestCallsForContact(contactId);

  const contact = await getContact(contactId);
  ensureCallable(contact.status);

  const flow = await getActiveCallFlow();
  const graph = getPublishedGraphForCall(flow);
  const staged = parseStagedFlow(flow.stagesJson);
  const startStageId =
    graph?.startNodeId ?? staged?.stages[0]?.id ?? JSON.parse(flow.stagesJson)[0]?.id ?? "opening";
  const initialContext =
    graph ? serializeGraphContext(initGraphContext(graph)) : "{}";

  const call = await prisma.call.create({
    data: {
      contactId,
      flowVersionId: flow.id,
      status: "connected",
      currentStage: startStageId,
      currentNodeId: graph ? startStageId : undefined,
      currentSubflowId: null,
      contextJson: initialContext,
    },
  });

  await prisma.call.update({
    where: { id: call.id },
    data: { externalCallId: `test-${call.id}` },
  });

  await transitionContactStatus(contactId, "in_call");
  broadcastCallEvent({ type: "call_status", callId: call.id, status: "connected" });

  return prisma.call.findUnique({
    where: { id: call.id },
    include: { contact: true },
  });
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
    unregisterBrowserSession(callId);
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
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { contact: true },
  });
  const tts = new TtsSession();
  const session = activeSessions.get(callId);
  if (session) session.tts = tts;
  await speakOnCall(callId, turn.sayText, tts, {
    addresseeSex: call?.contact?.sex,
  });

  if (call?.externalCallId?.startsWith("mock-")) {
    await finalizeCall(callId, "sold");
  }
}

export async function prepareInitialVoiceTurn(
  callId: string,
  options?: { precomputedSayText?: string },
): Promise<VoiceTurnResult> {
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
    if (!call.contextJson || call.contextJson === "{}") {
      graphContext = initGraphContext(sessionEngine.engine.getGraph());
    }
    const node = sessionEngine.engine.getCurrentNode();
    if (node?.type === "speak") {
      if (options?.precomputedSayText) {
        sayText = options.precomputedSayText;
      } else {
        sayText = await speakFromNode(
          node,
          call.contact,
          undefined,
          undefined,
          undefined,
          graphContext.variables,
        );
      }
      graphContext.lastSpokenText = sayText;
      const edge = sessionEngine.engine.getNextAutoEdge(node.id);
      if (edge) {
        sessionEngine.engine.currentNodeId = edge.target;
      }
    } else if (node?.type === "listen" || node?.type === "intent_route") {
      return { sayText: "", endCall: false };
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
        customerSex: call.contact.sex,
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
    const preloaded = preloadedOpeningClips.get(callId);
    const openingPlayedInWebhook = Boolean(preloaded);
    preloadedOpeningClips.delete(callId);

    const turn = await prepareInitialVoiceTurn(callId, {
      precomputedSayText: preloaded?.sayText,
    });

    if (openingPlayedInWebhook) {
      logger.info({ callId }, "Opening already queued in answer TwiML — skipping play update");
      return;
    }

    await waitForMediaSession(callId, 8000);

    const played = preloaded?.clipId
      ? await playPreloadedOnTwilioCall(callId, preloaded.clipId, turn.endCall)
      : await playOnTwilioCall(callId, turn.sayText, turn.endCall);

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

  const isSilence = text.trim() === "";
  const classification = isSilence
    ? {
        intentId: "silence",
        confidence: 1,
        entities: {},
        classifier: "rule" as const,
      }
    : await classifyUtterance(
        text,
        classifyOptionsForCall(
          {
            currentNodeId: call.currentNodeId,
            currentStage: call.currentStage,
            currentSubflowId: call.currentSubflowId,
            callFlow: call.callFlow,
          },
          session.session,
        ),
      );

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
  if (!ctx.variables) {
    ctx.variables = initGraphContext(engine.getGraph()).variables;
  }

  if (classification.intentId === "didnt_understand") {
    const listenId = getListenCheckpoint(engine);
    const speakNode = listenId ? speakNodeForListen(engine, listenId) : undefined;
    const stagePrompt =
      speakNode?.text
        ? resolveTemplate(
            speakNode.text,
            mergeTemplateVars(
              templateVars(call.contact.firstName, call.contact.familyName, call.contact.sex),
              flowVariablesForTemplate(ctx.variables ?? {}),
            ),
          )
        : undefined;
    const sayText = stagePrompt || ctx.lastSpokenText || "אשמח לחזור על השאלה.";
    if (stagePrompt) ctx.lastSpokenText = stagePrompt;
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

  const graph = engine.getGraph();
  const listenId = getListenCheckpoint(engine);
  const inSideFlow = isInSideFlow(ctx, engine);

  if (!inSideFlow && listenId && text.trim()) {
    const sideFlow = shouldEnterSideFlow(graph, listenId, classification, thresholds);
    if (sideFlow) {
      return runSideFlowEntry(
        callId,
        call,
        engine,
        listenId,
        sideFlow,
        ctx,
        classification,
        text,
      );
    }
  }

  if (
    listenId &&
    text.trim() &&
    !isMainPathAnswer(graph, listenId, classification, thresholds) &&
    shouldInterruptQa(graph, listenId, classification, thresholds)
  ) {
    const speakNode = speakNodeForListen(engine, listenId);
    const stagePromptFromNode =
      speakNode?.text
        ? resolveTemplate(
            speakNode.text,
            mergeTemplateVars(
              templateVars(call.contact.firstName, call.contact.familyName, call.contact.sex),
              flowVariablesForTemplate(ctx.variables ?? {}),
            ),
          )
        : "";
    const stagePrompt = stagePromptFromNode || ctx.lastSpokenText || "";
    const productCtx = await buildProductContext(classification.intentId, classification.entities);
    const reply = await generateSalesReply(text, {
      customerFirstName: call.contact.firstName,
      customerSex: call.contact.sex,
      stagePrompt,
      repeatQuestion: stagePrompt,
      isOpeningTurn: false,
      ...productCtx,
    });
    const answer = reply.text.trim() || (classification.intentId === "greeting_hi" ? "היי!" : "בטח, אשמח לעזור.");
    const sayText =
      stagePrompt && answer !== stagePrompt
        ? `${answer} ${stagePrompt}`.trim()
        : answer || stagePrompt;
    if (stagePrompt) ctx.lastSpokenText = stagePrompt;
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

  const listenNode = engine.getCurrentNode();
  if (listenNode?.type === "listen") {
    ctx.variables = applyListenBindings(
      graph.variableBindings,
      listenNode.id,
      routedClassification,
      text,
      graph.variables ?? [],
      ctx.variables ?? {},
    );
  }

  engine.advanceFromListen();
  let node = engine.getCurrentNode();
  if (node?.type === "intent_route") {
    node = engine.advanceByClassification(routedClassification, thresholds) ?? undefined;
  } else if (node?.type === "decision") {
    node = engine.advanceByDecision(ctx.variables ?? {}) ?? undefined;
  }

  let sayText = ctx.lastSpokenText || "אשמח להמשיך לעזור לך.";
  const spokenParts: string[] = [];

  while (node?.type === "speak" && !node.id.startsWith("goodbye_")) {
    const part = await speakFromNode(
      node,
      call.contact,
      node.useLlm && spokenParts.length === 0 ? text : undefined,
      node.useLlm && spokenParts.length === 0 ? classification.entities : undefined,
      node.useLlm && spokenParts.length === 0 ? classification.intentId : undefined,
      ctx.variables,
    );
    spokenParts.push(part);
    if (node.returnsToMain && ctx.mainCheckpoint) {
      sayText = restoreMainAfterSideFlow(engine, ctx, spokenParts) ?? spokenParts.join(" ");
      break;
    }
    const edge = engine.getNextAutoEdge(node.id);
    if (!edge) {
      node = undefined;
      break;
    }
    engine.currentNodeId = edge.target;
    const next = engine.getCurrentNode();
    if (next?.type !== "speak" || next.id.startsWith("goodbye_")) {
      node = next;
      break;
    }
    node = next;
  }

  if (spokenParts.length > 0) {
    sayText = spokenParts.join(" ");
    ctx.lastSpokenText = spokenParts[spokenParts.length - 1]!;
  }

  if (node?.type === "speak" && node.id.startsWith("goodbye_")) {
    sayText = await speakFromNode(node, call.contact, undefined, undefined, undefined, ctx.variables);
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
    customerSex: call.contact.sex,
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
  stopBrowserPlayback(callId);
  clearStagedSilence(callId);

  let turn: VoiceTurnResult;
  try {
    turn = await processCustomerTurn(callId, text);
  } catch (err) {
    logger.error({ err, callId }, "processCustomerTurn failed");
    turn = { sayText: "סליחה, אירעה שגיאה. אשמח לנסות שוב.", endCall: false };
  }

  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { contact: true },
  });
  const ttsOpts = { addresseeSex: call?.contact?.sex };
  const isTwilio =
    call?.externalCallId &&
    !call.externalCallId.startsWith("mock-") &&
    !isTestCall(call.externalCallId);

  if (isTwilio) {
    await playOnTwilioCall(callId, turn.sayText, turn.endCall);
    return;
  }

  if (isTestCall(call?.externalCallId)) {
    await speakToBrowser(callId, turn.sayText, turn.endCall, ttsOpts);
    return;
  }

  if (turn.endCall) return;

  const replyTts = new TtsSession();
  const updated = activeSessions.get(callId);
  if (updated) updated.tts = replyTts;
  await speakOnCall(callId, turn.sayText, replyTts, ttsOpts);
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

export async function hangUpCall(callId: string): Promise<void> {
  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call) throw new AppError(404, "שיחה לא נמצאה");

  const terminal = new Set<CallStatus>(["ended", "failed", "no_answer", "busy"]);
  if (terminal.has(call.status)) return;

  stopBrowserPlayback(callId);
  clearPlayback(callId);
  activeSessions.delete(callId);
  voiceSessionsStarted.delete(callId);
  clearStagedSilence(callId);

  if (isTestCall(call.externalCallId)) {
    disconnectBrowserTestCall(callId);
    await updateCallStatus(callId, "ended", "none");
    return;
  }

  if (call.externalCallId && !call.externalCallId.startsWith("mock-")) {
    try {
      await hangupTwilioCall(call.externalCallId);
    } catch (err) {
      logger.warn({ err, callId }, "Twilio hangup failed — ending call locally");
    }
    unregisterMediaStream(callId);
  }

  const durationSec = Math.floor((Date.now() - call.startedAt.getTime()) / 1000);
  await prisma.call.update({
    where: { id: callId },
    data: {
      summary: "נותק ידנית על ידי המפעיל",
      durationSec,
    },
  });
  await updateCallStatus(callId, "ended", "none");
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

registerBrowserTestHandlers({
  onCustomerSpeech: handleCustomerSpeech,
  onSessionStart: async (callId) => {
    if (voiceSessionsStarted.has(callId)) return;
    voiceSessionsStarted.add(callId);
    const turn = await prepareInitialVoiceTurn(callId);
    if (!turn.sayText.trim()) return;
    const call = await prisma.call.findUnique({
      where: { id: callId },
      include: { contact: true },
    });
    await speakToBrowser(callId, turn.sayText, turn.endCall, {
      addresseeSex: call?.contact?.sex,
    });
  },
  onSessionEnd: async (callId) => {
    await new Promise((r) => setTimeout(r, 5000));
    if (hasBrowserSession(callId)) return;
    const call = await prisma.call.findUnique({ where: { id: callId } });
    if (call?.status === "connected" && isTestCall(call.externalCallId)) {
      await updateCallStatus(callId, "ended", "none");
    }
    voiceSessionsStarted.delete(callId);
  },
});
