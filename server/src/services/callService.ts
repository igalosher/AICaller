import type { CallOutcome, CallStatus, ContactSex } from "@prisma/client";
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
import { TtsSession, synthesizeHebrewSpeech } from "../voice/tts.js";
import { detectVoiceActivity } from "../voice/stt.js";
import {
  clearPlayback,
  hasMediaSession,
  isStreamingTtsOnCall,
  registerMediaStreamCallbacks,
  registerVoiceHandlers,
  speakOnCall,
  startThinkingOnCall,
  stopThinkingOnCall,
  unregisterMediaStream,
} from "../voice/mediaSession.js";
import {
  clearBrowserTestSkipVoice,
  disconnectBrowserTestCall,
  completePendingCallEnd,
  hasBrowserSession,
  registerBrowserTestHandlers,
  setBrowserPendingCallEnd,
  setBrowserTestSkipVoice,
  speakToBrowser,
  startThinkingToBrowser,
  stopBrowserPlayback,
  stopThinkingToBrowser,
  unregisterBrowserSession,
} from "../voice/browserTestSession.js";
import { hangupTwilioCall, interruptTwilioPlay, playOnTwilioCall, playThinkingOnTwilioCall } from "../voice/twilioPlay.js";
import { createPlayClip } from "../voice/playAudio.js";
import { toTelephonyError } from "../telephony/errors.js";
import { ensureTwilioWebhookReady } from "../telephony/tunnelManager.js";
import { getConversationMode } from "./conversationModeService.js";
import { prepareAgentOpening, processAgentTurn } from "../agent/agentRuntime.js";
import { serializeAgentContext } from "../agent/agentLlm.js";
import { getAgentConfig } from "./agentConfigService.js";
import { logger } from "../logger.js";
import { createEngineFromGraph, GraphFlowEngine } from "../flow/graphFlowEngine.js";
import {
  getListenCheckpoint,
  getListenScopedIntentIds,
  initGraphContext,
  isOrphanAnnouncementRoute,
  advanceOrphanAnnouncementRoute,
  parseGraphContext,
  resolveListenIdFromPosition,
  serializeGraphContext,
  isMainPathAnswer,
  shouldInterruptQa,
  speakNodeForListen,
} from "../flow/graphFlowRuntime.js";
import {
  collectSideFlowSpeakNodes,
  collectSideFlowSubgraphNodeIds,
  findActiveSideFlow,
  findSideFlowFarewellSpeak,
  isInSideFlow,
  isSideFlowExitIntent,
  isSideFlowProductConversation,
  shouldEnterSideFlow,
} from "../flow/sideFlowRuntime.js";
import { isProductQaIntent } from "../flow/graphFlowRuntime.js";
import { applyListenBindings, flowVariablesForTemplate } from "../flow/variableBinding.js";
import { mergeTemplateVars, resolveTemplate } from "../utils/template.js";
import { lookupFiberAvailability } from "./fiberLookup.js";
import { getPublishedGraphForCall } from "./flowGraphService.js";
import {
  appendTestRewindSnapshot,
  canRewindTestCall,
  computeTestCallRewind,
  syncTestCallGraphEngine,
} from "./testCallRewind.js";
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
import { POLITE_GOODBYE } from "../flow/sigalMiniFlow.js";
import type { SpeakNode, SideFlowDef } from "../flow/graphTypes.js";
import type { StagedFlowDefinition, StagedStage } from "../flow/stagedFlowTypes.js";
import type { CallOutcome, CallStatus, CallFlow, Contact } from "@prisma/client";

export type VoiceTurnResult = { sayText: string; endCall: boolean; pendingOutcome?: CallOutcome };

type SessionEngine =
  | { mode: "graph"; engine: GraphFlowEngine }
  | { mode: "linear"; engine: CallFlowEngine }
  | { mode: "staged"; engine: StagedFlowEngine }
  | { mode: "agent" };

const activeSessions = new Map<string, { tts?: TtsSession; session: SessionEngine }>();
const voiceSessionsStarted = new Set<string>();
const voiceKickoffStarted = new Set<string>();
/** Browser test calls — skip Twilio-style silence retries and track kickoff across WS reconnects. */
const browserTestCallIds = new Set<string>();
const browserTestKickoffDone = new Set<string>();
const browserTestKickoffInFlight = new Set<string>();

async function markCallRingingIfActive(
  callId: string,
  externalCallId: string,
): Promise<void> {
  const updated = await prisma.call.updateMany({
    where: { id: callId, status: "dialing" },
    data: { externalCallId, status: "ringing" },
  });
  if (updated.count === 0) {
    const current = await prisma.call.findUnique({
      where: { id: callId },
      select: { status: true },
    });
    logger.info(
      { callId, status: current?.status },
      "Skipping ringing update — call already moved past dialing",
    );
    return;
  }
  broadcastCallEvent({ type: "call_status", callId, status: "ringing" });
}
const stagedSilenceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const graphSilenceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const preloadedOpeningClips = new Map<string, { clipId: string; sayText: string; durationMs: number }>();
const queuedCustomerSpeech = new Map<string, string>();
const customerSpeechWorkers = new Map<string, Promise<void>>();
const aiPlaybackUntil = new Map<string, number>();
type AiPlaybackKind = "twiml" | "stream";
const aiPlaybackKind = new Map<string, AiPlaybackKind>();

/** Seconds of customer silence at a graph listen checkpoint before repeating the last question. */
export const GRAPH_LISTEN_SILENCE_SEC = 20;
/** After this many consecutive silences at a listen, say goodbye and end the call. */
export const GRAPH_SILENCE_MAX_RETRIES = 5;
/** Buffer after estimated playback so Twilio finishes the clip before we listen. */
const PLAYBACK_END_BUFFER_MS = 1500;

/** Called from answer webhook as soon as opening audio is queued in TwiML. */
export function markOpeningPlaybackStarted(callId: string, durationMs: number): void {
  markAiPlayback(callId, durationMs, "twiml");
}

function markAiPlayback(callId: string, playbackMs: number, kind: AiPlaybackKind = "stream"): void {
  if (playbackMs <= 0) return;
  const until = Date.now() + playbackMs + PLAYBACK_END_BUFFER_MS;
  const prev = aiPlaybackUntil.get(callId) ?? 0;
  aiPlaybackUntil.set(callId, Math.max(prev, until));
  aiPlaybackKind.set(callId, kind);
}

function clearAiPlayback(callId: string): void {
  aiPlaybackUntil.delete(callId);
  aiPlaybackKind.delete(callId);
}

function aiPlaybackRemainingMs(callId: string): number {
  const until = aiPlaybackUntil.get(callId);
  if (!until) return 0;
  return Math.max(0, until - Date.now());
}

export function isAiSpeaking(callId: string): boolean {
  return aiPlaybackRemainingMs(callId) > 0;
}

function onAiPlaybackEnded(callId: string): void {
  clearAiPlayback(callId);
  if (browserTestCallIds.has(callId)) return;
  maybeScheduleGraphSilenceForCall(callId);
}

function startThinkingFeedback(callId: string, twilioCall = false): void {
  if (twilioCall) {
    void playThinkingOnTwilioCall(callId);
  } else {
    startThinkingOnCall(callId);
  }
  startThinkingToBrowser(callId);
}

function stopThinkingFeedback(callId: string, twilioCall = false): void {
  if (twilioCall) {
    void interruptTwilioPlay(callId);
  } else {
    stopThinkingOnCall(callId);
  }
  stopThinkingToBrowser(callId);
}

export async function interruptAiPlayback(callId: string): Promise<void> {
  const kind = aiPlaybackKind.get(callId);
  const call = await prisma.call.findUnique({
    where: { id: callId },
    select: { externalCallId: true },
  });
  const isTwilio =
    call?.externalCallId &&
    !call.externalCallId.startsWith("mock-") &&
    !isTestCall(call.externalCallId);
  const session = activeSessions.get(callId);
  session?.tts?.abort();
  clearPlayback(callId);
  stopBrowserPlayback(callId);
  stopThinkingFeedback(callId, Boolean(isTwilio));
  clearGraphSilence(callId);
  clearAiPlayback(callId);
  if (kind === "twiml") {
    await interruptTwilioPlay(callId);
  }
}

function deferGraphSilenceUntilAiDone(callId: string): void {
  const session = activeSessions.get(callId);
  if (session?.session.mode !== "graph") {
    clearGraphSilence(callId);
    return;
  }
  if (!getListenCheckpoint(session.session.engine)) {
    clearGraphSilence(callId);
    return;
  }

  clearGraphSilence(callId);
  const remaining = aiPlaybackRemainingMs(callId);
  if (remaining > 0) {
    const timer = setTimeout(() => {
      graphSilenceTimers.delete(callId);
      onAiPlaybackEnded(callId);
    }, remaining);
    graphSilenceTimers.set(callId, timer);
    return;
  }
  onAiPlaybackEnded(callId);
}

export function peekPreloadedOpening(callId: string): { clipId: string; sayText: string; durationMs: number } | undefined {
  return preloadedOpeningClips.get(callId);
}

type OpeningClip = { clipId: string; sayText: string; durationMs: number };

async function resolveOpeningSayText(
  contact: Contact,
  flow: CallFlow,
  graph: ReturnType<typeof getPublishedGraphForCall>,
  startNodeId: string,
  initialContext: string,
): Promise<string> {
  if (graph) {
    const engine = createEngineFromGraph(JSON.stringify(graph), startNodeId);
    const graphContext = parseGraphContext(initialContext);
    const node = engine.getCurrentNode();
    if (node?.type === "speak") {
      return speakFromNode(
        node,
        contact,
        undefined,
        undefined,
        undefined,
        graphContext.variables,
      );
    }
    return "שלום.";
  }
  const parsed = parseCallFlow(flow);
  return previewOpeningLine(
    parsed.openingTemplate,
    contactFullName(contact.firstName, contact.familyName),
  );
}

async function synthesizeOpeningClip(
  callId: string,
  contact: Contact,
  sayText: string,
): Promise<OpeningClip> {
  const ttsOpts = { addresseeSex: contact.sex };
  const clip = await createPlayClip(sayText, ttsOpts);
  if (!clip) {
    throw new AppError(503, "לא ניתן לסנתז את פתיחת השיחה — נסה שוב בעוד רגע");
  }
  const result = { clipId: clip.id, sayText, durationMs: clip.durationMs };
  preloadedOpeningClips.set(callId, result);
  logger.info({ callId, durationMs: clip.durationMs, clipId: clip.id }, "Opening audio rendered");
  return result;
}

async function preloadOpeningAudio(
  callId: string,
  contact: Contact,
  flow: CallFlow,
  graph: ReturnType<typeof getPublishedGraphForCall>,
  startNodeId: string,
  initialContext: string,
): Promise<OpeningClip> {
  const sayText = await resolveOpeningSayText(contact, flow, graph, startNodeId, initialContext);
  return synthesizeOpeningClip(callId, contact, sayText);
}

/** Answer webhook fallback when in-memory clip was lost (e.g. server restart while ringing). */
export async function ensureOpeningClipForAnswer(callId: string): Promise<OpeningClip | null> {
  const cached = preloadedOpeningClips.get(callId);
  if (cached) return cached;

  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { contact: true, callFlow: true },
  });
  if (!call?.contact || !call.callFlow) return null;

  if (call.conversationMode === "agent") {
    try {
      const config = await getAgentConfig();
      const sayText = config.openingTemplateHe.replace(
        /\{\{customer_full_name\}\}/g,
        contactFullName(call.contact.firstName, call.contact.familyName),
      );
      logger.warn({ callId }, "Agent opening clip missing at answer — rendering");
      return synthesizeOpeningClip(callId, call.contact, sayText);
    } catch (err) {
      logger.error({ err, callId }, "Failed to render agent opening at answer");
      return null;
    }
  }

  try {
    const graph = getPublishedGraphForCall(call.callFlow);
    const startNodeId = call.currentNodeId ?? graph?.startNodeId ?? "speak_opening";
    const sayText = await resolveOpeningSayText(
      call.contact,
      call.callFlow,
      graph,
      startNodeId,
      call.contextJson ?? "{}",
    );
    logger.warn({ callId }, "Opening clip missing at answer — rendering before TwiML");
    return synthesizeOpeningClip(callId, call.contact, sayText);
  } catch (err) {
    logger.error({ err, callId }, "Failed to render opening audio at answer");
    return null;
  }
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

export function clearGraphSilence(callId: string): void {
  const t = graphSilenceTimers.get(callId);
  if (t) {
    clearTimeout(t);
    graphSilenceTimers.delete(callId);
  }
}

export function scheduleGraphSilence(callId: string): void {
  if (browserTestCallIds.has(callId)) return;
  clearGraphSilence(callId);
  const timer = setTimeout(() => {
    void handleGraphSilenceTimeout(callId);
  }, GRAPH_LISTEN_SILENCE_SEC * 1000);
  graphSilenceTimers.set(callId, timer);
}

function reconcileStaleAiPlayback(callId: string): void {
  if (!isAiSpeaking(callId)) return;
  if (isStreamingTtsOnCall(callId)) return;
  const kind = aiPlaybackKind.get(callId);
  if (kind === "stream") {
    logger.warn({ callId, remainingMs: aiPlaybackRemainingMs(callId) }, "Clearing stale stream playback estimate");
    clearAiPlayback(callId);
  }
}

function shouldDeferForAiPlayback(callId: string): boolean {
  if (!isAiSpeaking(callId)) return false;
  reconcileStaleAiPlayback(callId);
  if (!isAiSpeaking(callId)) return false;
  if (isStreamingTtsOnCall(callId)) return true;
  return aiPlaybackKind.get(callId) === "twiml";
}

async function handleGraphSilenceTimeout(callId: string): Promise<void> {
  graphSilenceTimers.delete(callId);
  if (browserTestCallIds.has(callId)) return;
  if (shouldDeferForAiPlayback(callId)) {
    deferGraphSilenceUntilAiDone(callId);
    return;
  }

  const session = activeSessions.get(callId);
  if (session?.session.mode === "agent") {
    // agent mode uses the same silence repeat timer
  } else if (session?.session.mode !== "graph") return;
  if (session?.session.mode === "graph") {
    const listenId = getListenCheckpoint(session.session.engine);
    if (!listenId) return;
  }

  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call || call.status !== "connected") return;
  if (isTestCall(call.externalCallId)) return;

  try {
    await handleCustomerSpeech(callId, "");
  } catch (err) {
    logger.error({ err, callId }, "graph silence repeat failed");
  }
}

export function maybeScheduleGraphSilenceForCall(callId: string): void {
  if (browserTestCallIds.has(callId)) {
    clearGraphSilence(callId);
    return;
  }
  const session = activeSessions.get(callId);
  if (session?.session.mode === "agent") {
    scheduleGraphSilence(callId);
    return;
  }
  if (session?.session.mode !== "graph") {
    clearGraphSilence(callId);
    return;
  }
  if (getListenCheckpoint(session.session.engine)) {
    scheduleGraphSilence(callId);
  } else {
    clearGraphSilence(callId);
  }
}

/** Wait for AI speech to finish, then start the customer-silence countdown. */
export function scheduleGraphSilenceAfterPlayback(
  callId: string,
  playbackMs: number,
  kind: AiPlaybackKind = "stream",
): void {
  if (playbackMs <= 0) {
    clearAiPlayback(callId);
    maybeScheduleGraphSilenceForCall(callId);
    return;
  }
  markAiPlayback(callId, playbackMs, kind);
  deferGraphSilenceUntilAiDone(callId);
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
  options?: { conversation?: boolean },
): Promise<{
  channelContext?: string;
  packetContext?: string;
  internetContext?: string;
  routerContext?: string;
  optionsContext?: string;
}> {
  const channelContext = entities?.channel ? await buildChannelContext(entities.channel) : undefined;
  const packetContext = entities?.packet;
  const fullCatalog = options?.conversation || isProductQaIntent(intentId);

  if (intentId === "ask_internet" || fullCatalog) {
    const tiers = await productTools.list_internet_tiers();
    const internetContext = tiers.map((t) => `${t.name}: ${t.downloadMbps} מגה, ${t.priceMonthly} ש״ח`).join("; ");
    if (intentId === "ask_internet" && !fullCatalog) {
      return { channelContext, packetContext, internetContext };
    }
    if (fullCatalog) {
      const router = await productTools.router_rental_info();
      const optionsData = await productTools.compare_options();
      return {
        channelContext,
        packetContext,
        internetContext,
        routerContext: router.summaryHe,
        optionsContext: JSON.stringify(optionsData),
      };
    }
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

async function hangUpAfterSilenceRetries(
  callId: string,
  call: CallWithRelations,
  engine: GraphFlowEngine,
  ctx: ReturnType<typeof parseGraphContext>,
): Promise<VoiceTurnResult> {
  ctx.silenceRetries = 0;
  clearGraphSilence(callId);
  const sayText = POLITE_GOODBYE;
  ctx.lastSpokenText = sayText;
  await persistGraphTurn(callId, engine, ctx, sayText, "goodbye_polite", {
    externalCallId: call.externalCallId,
  });
  return { sayText, endCall: true, pendingOutcome: "refused" };
}

async function repeatGraphQuestionAtListen(
  callId: string,
  call: CallWithRelations,
  engine: GraphFlowEngine,
  ctx: ReturnType<typeof parseGraphContext>,
): Promise<VoiceTurnResult> {
  const listenId = getListenCheckpoint(engine);
  const speakNode = listenId ? speakNodeForListen(engine, listenId) : undefined;
  const stagePrompt =
    resolveSpeakPrompt(speakNode, call.contact, ctx.variables ?? {}) ||
    ctx.lastSpokenText ||
    "אשמח לחזור על השאלה.";
  if (stagePrompt) ctx.lastSpokenText = stagePrompt;
  await persistGraphTurn(callId, engine, ctx, stagePrompt, speakNode?.id, {
    externalCallId: call.externalCallId,
  });
  return { sayText: stagePrompt, endCall: false };
}

async function persistGraphTurn(
  callId: string,
  engine: GraphFlowEngine,
  ctx: ReturnType<typeof parseGraphContext>,
  sayText: string,
  flowNodeId?: string,
  options?: { externalCallId?: string | null },
): Promise<void> {
  const segment = await addTranscript(callId, "ai", sayText, flowNodeId);
  const current = await prisma.call.findUnique({
    where: { id: callId },
    select: { contextJson: true },
  });
  let contextToSave = ctx;
  if (isTestCall(options?.externalCallId)) {
    const parsed = parseGraphContext(current?.contextJson ?? "{}");
    const stack = parsed.testRewindStack ?? [];
    stack.push({
      currentNodeId: engine.currentNodeId,
      variables: ctx.variables ? structuredClone(ctx.variables) : {},
      lastSpokenText: ctx.lastSpokenText,
      mainCheckpoint: ctx.mainCheckpoint ? { ...ctx.mainCheckpoint } : undefined,
      lastTranscriptSegmentId: segment.id,
    });
    contextToSave = { ...ctx, testRewindStack: stack };
  }
  await prisma.call.update({
    where: { id: callId },
    data: {
      currentNodeId: engine.currentNodeId,
      currentStage: engine.currentNodeId,
      contextJson: serializeGraphContext(contextToSave),
    },
  });
}

async function runSideFlowEntry(
  callId: string,
  call: CallWithRelations,
  engine: GraphFlowEngine,
  listenId: string,
  sideFlow: SideFlowDef,
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
    sideFlowId: sideFlow.id,
  };

  const productConversation = isSideFlowProductConversation(graph, sideFlow);
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
      { productConversation },
    );
    spokenParts.push(part);
  }

  const lastSpeak = speaks[speaks.length - 1];
  let sayText = spokenParts.join(" ");
  const afterLastEdge = lastSpeak ? graph.edges.find((e) => e.source === lastSpeak.id) : undefined;
  const afterLastNode = afterLastEdge
    ? graph.nodes.find((n) => n.id === afterLastEdge.target)
    : undefined;

  if (lastSpeak?.returnsToMain && ctx.mainCheckpoint) {
    engine.currentNodeId = ctx.mainCheckpoint.resumeNodeId;
    const repeat = ctx.mainCheckpoint.lastSpokenText;
    sayText = `${sayText} ${repeat}`.trim();
    ctx.lastSpokenText = repeat;
    delete ctx.mainCheckpoint;
  } else if (afterLastNode?.type === "listen") {
    engine.currentNodeId = afterLastNode.id;
    ctx.lastSpokenText = spokenParts[spokenParts.length - 1] ?? "";
  } else if (lastSpeak) {
    engine.currentNodeId = lastSpeak.id;
    const edge = engine.getNextAutoEdge(lastSpeak.id);
    if (edge) {
      const next = graph.nodes.find((n) => n.id === edge.target);
      if (next) engine.currentNodeId = next.id;
    }
    ctx.lastSpokenText = spokenParts[spokenParts.length - 1] ?? "";
  }

  await persistGraphTurn(callId, engine, ctx, sayText, lastSpeak?.id, {
    externalCallId: call.externalCallId,
  });
  return { sayText, endCall: false };
}

async function processSideFlowTurn(
  callId: string,
  call: CallWithRelations,
  engine: GraphFlowEngine,
  text: string,
  classification: Awaited<ReturnType<typeof classifyUtterance>>,
  ctx: ReturnType<typeof parseGraphContext>,
  thresholds: Record<string, number>,
): Promise<VoiceTurnResult | null> {
  const graph = engine.getGraph();
  const activeSideFlow = findActiveSideFlow(graph, ctx, engine);
  if (!activeSideFlow || !ctx.mainCheckpoint) return null;

  const subgraph = collectSideFlowSubgraphNodeIds(graph, activeSideFlow.entryNodeId);
  const listenId = getListenCheckpoint(engine);
  if (!listenId || !subgraph.has(listenId)) return null;

  const productConversation = isSideFlowProductConversation(graph, activeSideFlow);

  if (
    (classification.intentId === "didnt_understand" || classification.intentId === "silence") &&
    ctx.lastSpokenText
  ) {
    const sayText = ctx.lastSpokenText;
    await persistGraphTurn(callId, engine, ctx, sayText, undefined, {
      externalCallId: call.externalCallId,
    });
    return { sayText, endCall: false };
  }

  if (isSideFlowExitIntent(classification.intentId)) {
    const farewell = findSideFlowFarewellSpeak(graph, activeSideFlow.entryNodeId);
    const spokenParts: string[] = [];
    if (farewell) {
      const part = await speakFromNode(
        farewell,
        call.contact,
        undefined,
        undefined,
        undefined,
        ctx.variables,
      );
      spokenParts.push(part);
    }
    engine.currentNodeId = ctx.mainCheckpoint.resumeNodeId;
    const repeat = ctx.mainCheckpoint.lastSpokenText;
    const sayText = [...spokenParts, repeat].filter(Boolean).join(" ").trim();
    ctx.lastSpokenText = repeat;
    delete ctx.mainCheckpoint;
    await persistGraphTurn(callId, engine, ctx, sayText, farewell?.id, {
      externalCallId: call.externalCallId,
    });
    return { sayText, endCall: false };
  }

  engine.currentNodeId = listenId;
  engine.advanceFromListen();
  let node = engine.getCurrentNode();
  if (node?.type === "intent_route") {
    node = engine.advanceByClassification(classification, thresholds) ?? undefined;
  }

  const spokenParts: string[] = [];
  let lastSpeakNodeId: string | undefined;
  while (node?.type === "speak" && subgraph.has(node.id)) {
    lastSpeakNodeId = node.id;
    const part = await speakFromNode(
      node,
      call.contact,
      node.useLlm ? text : undefined,
      node.useLlm ? classification.entities : undefined,
      node.useLlm ? classification.intentId : undefined,
      ctx.variables,
      { productConversation },
    );
    spokenParts.push(part);

    if (node.returnsToMain && ctx.mainCheckpoint) {
      engine.currentNodeId = ctx.mainCheckpoint.resumeNodeId;
      const repeat = ctx.mainCheckpoint.lastSpokenText;
      const sayText = [...spokenParts, repeat].join(" ").trim();
      ctx.lastSpokenText = repeat;
      delete ctx.mainCheckpoint;
      await persistGraphTurn(callId, engine, ctx, sayText, lastSpeakNodeId, {
        externalCallId: call.externalCallId,
      });
      return { sayText, endCall: false };
    }

    const edge = engine.getNextAutoEdge(node.id);
    if (!edge) break;
    engine.currentNodeId = edge.target;
    const next = engine.getCurrentNode();
    if (next?.type === "listen" && subgraph.has(next.id)) {
      ctx.lastSpokenText = spokenParts[spokenParts.length - 1] ?? "";
      const sayText = spokenParts.join(" ");
      await persistGraphTurn(callId, engine, ctx, sayText, lastSpeakNodeId, {
        externalCallId: call.externalCallId,
      });
      return { sayText, endCall: false };
    }
    if (next?.type !== "speak") break;
    node = next;
  }

  return null;
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
  options?: { productConversation?: boolean },
): Promise<string> {
  const vars = mergeTemplateVars(
    templateVars(contact.firstName, contact.familyName, contact.sex),
    flowVariablesForTemplate(flowVariables ?? {}),
  );
  let text = resolveTemplate(node.text, vars);

  if (node.useLlm) {
    const productCtx = await buildProductContext(intentId ?? "", entities, {
      conversation: options?.productConversation,
    });
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
    voiceKickoffStarted.delete(call.id);
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
    browserTestCallIds.delete(call.id);
    browserTestKickoffDone.delete(call.id);
    clearBrowserTestSkipVoice(call.id);
    logger.info({ callId: call.id, contactId }, "Ended prior browser test call for new test");
  }
}

export async function startCall(contactId: string) {
  await recoverStuckContacts();

  const contact = await getContact(contactId);
  ensureCallable(contact.status);

  const flow = await getActiveCallFlow();
  const mode = await getConversationMode();
  const graph = getPublishedGraphForCall(flow);
  const staged = parseStagedFlow(flow.stagesJson);
  const startStageId =
    graph?.startNodeId ?? staged?.stages[0]?.id ?? JSON.parse(flow.stagesJson)[0]?.id ?? "opening";
  const initialContext =
    mode === "agent"
      ? serializeAgentContext({ rejectionCount: 0 })
      : graph
        ? serializeGraphContext(initGraphContext(graph))
        : "{}";

  const call = await prisma.call.create({
    data: {
      contactId,
      flowVersionId: flow.id,
      status: "dialing",
      currentStage: startStageId,
      currentNodeId: graph ? startStageId : undefined,
      currentSubflowId: null,
      contextJson: initialContext,
      conversationMode: mode,
    },
  });

  await transitionContactStatus(contactId, "in_call");

  try {
    const telephonyConfig = await getTelephonyConfig();
    if (telephonyConfig.provider === "twilio") {
      await ensureTwilioWebhookReady();
    }
    const provider = await getTelephonyProvider();
    if (telephonyConfig.provider === "twilio" && provider.name !== "twilio") {
      throw new AppError(
        503,
        "Twilio מוגדר אך חסרים פרטי התחברות (Account SID, Auth Token, או מספר טלפון).",
      );
    }

    const destination = toE164(contact.phone);
    logger.info(
      { callId: call.id, provider: provider.name, to: destination },
      "Placing outbound call now",
    );

    const dial = await provider.dial(destination, call.id);
    await markCallRingingIfActive(call.id, dial.externalCallId);
    logger.info(
      { callId: call.id, externalCallId: dial.externalCallId, status: dial.status },
      "Outbound call queued",
    );

    if (telephonyConfig.provider === "twilio") {
      void (async () => {
        try {
          if (mode === "agent") {
            const config = await getAgentConfig();
            const sayText = config.openingTemplateHe.replace(
              /\{\{customer_full_name\}\}/g,
              contactFullName(contact.firstName, contact.familyName),
            );
            if (sayText.trim()) {
              const clip = await synthesizeOpeningClip(call.id, contact, sayText);
              preloadedOpeningClips.set(call.id, clip);
              logger.info({ callId: call.id, durationMs: clip.durationMs }, "Preloaded agent opening audio");
            }
          } else {
            const openingClip = await preloadOpeningAudio(
              call.id,
              contact,
              flow,
              graph,
              startStageId,
              initialContext,
            );
            logger.info(
              { callId: call.id, durationMs: openingClip.durationMs },
              "Preloaded opening audio",
            );
          }
        } catch (err) {
          logger.error({ err, callId: call.id }, "Opening audio preload failed");
        }
      })();
    }

    if (provider.name === "mock") {
      setTimeout(() => void runVoiceSession(call.id), 1500);
    }

    return prisma.call.findUnique({
      where: { id: call.id },
      include: { contact: true },
    });
  } catch (err) {
    logger.error({ err, callId: call.id, contactId }, "startCall failed");
    preloadedOpeningClips.delete(call.id);
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
export async function startTestCall(contactId: string, options?: { skipVoice?: boolean }) {
  await recoverStuckContacts();
  await endActiveTestCallsForContact(contactId);

  const contact = await getContact(contactId);
  ensureCallable(contact.status);

  const flow = await getActiveCallFlow();
  const mode = await getConversationMode();
  const graph = getPublishedGraphForCall(flow);
  const staged = parseStagedFlow(flow.stagesJson);
  const startStageId =
    graph?.startNodeId ?? staged?.stages[0]?.id ?? JSON.parse(flow.stagesJson)[0]?.id ?? "opening";
  const initialContext =
    mode === "agent"
      ? serializeAgentContext({ rejectionCount: 0 })
      : graph
        ? serializeGraphContext(initGraphContext(graph))
        : "{}";

  const call = await prisma.call.create({
    data: {
      contactId,
      flowVersionId: flow.id,
      status: "connected",
      currentStage: startStageId,
      currentNodeId: graph ? startStageId : undefined,
      currentSubflowId: null,
      contextJson: initialContext,
      conversationMode: mode,
    },
  });

  await prisma.call.update({
    where: { id: call.id },
    data: { externalCallId: `test-${call.id}` },
  });

  browserTestCallIds.add(call.id);
  setBrowserTestSkipVoice(call.id, Boolean(options?.skipVoice));

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
    voiceKickoffStarted.delete(callId);
    browserTestCallIds.delete(callId);
    browserTestKickoffDone.delete(callId);
    clearBrowserTestSkipVoice(callId);
    clearStagedSilence(callId);
    if (!isTestCall(call.externalCallId)) {
      unregisterBrowserSession(callId);
    }
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
  const playbackMs = await speakOnCall(callId, turn.sayText, tts, {
    addresseeSex: call?.contact?.sex,
  });
  scheduleGraphSilenceAfterPlayback(callId, playbackMs);

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

  if (call.conversationMode === "agent") {
    activeSessions.set(callId, { session: { mode: "agent" } });
    const turn = await prepareAgentOpening(callId, call.contact);
    if (turn.sayText.trim()) {
      await addTranscript(callId, "ai", turn.sayText);
    }
    return turn;
  }

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
  let openingFlowNodeId: string | undefined;

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
      openingFlowNodeId = node.id;
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

  await addTranscript(callId, "ai", sayText, openingFlowNodeId);
  if (sessionEngine.mode === "graph" && isTestCall(call.externalCallId)) {
    const openingSegment = await prisma.callTranscriptSegment.findFirst({
      where: { callId, speaker: "ai" },
      orderBy: { timestamp: "desc" },
    });
    if (openingSegment) {
      await appendTestRewindSnapshot(
        callId,
        call.externalCallId,
        sessionEngine.engine,
        graphContext,
        openingSegment.id,
      );
    }
  }
  scheduleStagedSilence(callId, scheduleSilenceSec);

  return { sayText, endCall: false };
}

export async function kickoffInitialVoice(callId: string): Promise<void> {
  try {
    const preloaded = preloadedOpeningClips.get(callId);

    const turn = await prepareInitialVoiceTurn(callId, {
      precomputedSayText: preloaded?.sayText,
    });
    preloadedOpeningClips.delete(callId);

    if (turn.endCall) return;
    if (!turn.sayText.trim()) {
      scheduleGraphSilenceAfterPlayback(callId, 0);
      return;
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

    if (isTwilio && hasMediaSession(callId)) {
      const openingTts = new TtsSession();
      const session = activeSessions.get(callId);
      if (session) session.tts = openingTts;
      const playbackMs = await speakOnCall(callId, turn.sayText, openingTts, ttsOpts);
      logger.info({ callId, playbackMs }, "Opening streamed on bidirectional media stream");
      scheduleGraphSilenceAfterPlayback(callId, playbackMs, "stream");
      return;
    }

    if (!isTwilio) return;

    const played = await playOnTwilioCall(callId, turn.sayText, turn.endCall);

    if (!played.ok) {
      logger.warn({ callId }, "Initial ElevenLabs play failed — call stays connected on hold");
    }
    scheduleGraphSilenceAfterPlayback(callId, played.durationMs, "twiml");
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

  if (call.conversationMode === "agent") {
    let session = activeSessions.get(callId);
    if (!session) {
      session = { session: { mode: "agent" } };
      activeSessions.set(callId, session);
    }

    const isSilence = text.trim() === "";
    if (!isSilence) {
      await addTranscript(callId, "customer", text);
    }

    const turn = await processAgentTurn(callId, text, call.contact);
    if (turn.sayText.trim()) {
      await addTranscript(callId, "ai", turn.sayText);
    }
    return turn;
  }

  let session = activeSessions.get(callId);
  if (!session) {
    const sessionEngine = createSessionEngine(call.callFlow);
    if (call.currentNodeId && sessionEngine.mode === "graph") {
      sessionEngine.engine.currentNodeId = call.currentNodeId;
      if (isTestCall(call.externalCallId)) {
        await syncTestCallGraphEngine(sessionEngine.engine, call.currentNodeId);
      }
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
    const customerFlowNodeId =
      session.session.mode === "graph"
        ? getListenCheckpoint(session.session.engine) ?? undefined
        : undefined;
    const segment = await addTranscript(callId, "customer", text, customerFlowNodeId);
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
    if (isTestCall(call.externalCallId)) {
      await syncTestCallGraphEngine(session.session.engine, call.currentNodeId ?? session.session.engine.currentNodeId);
    }
    return processGraphTurn(callId, call as CallWithRelations, session.session.engine, text, classification);
  }

  return processLinearTurn(callId, call as CallWithRelations, session.session.engine, text);
}

type CallWithRelations = {
  id: string;
  contactId: string;
  externalCallId: string | null;
  currentNodeId: string | null;
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
  if (result.endCall) {
    const outcome = result.outcome ?? "none";
    if (outcome !== "none") {
      return { sayText: result.sayText, endCall: true, pendingOutcome: outcome };
    }
    return { sayText: result.sayText, endCall: true, pendingOutcome: "none" };
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
  if (isTestCall(call.externalCallId)) {
    await syncTestCallGraphEngine(engine, call.currentNodeId ?? engine.currentNodeId);
  }
  const thresholds = await getIntentThresholds();
  const ctx = parseGraphContext(call.contextJson);
  if (!ctx.variables) {
    ctx.variables = initGraphContext(engine.getGraph()).variables;
  }

  if (classification.intentId !== "silence" && classification.intentId !== "didnt_understand") {
    ctx.silenceRetries = 0;
  }

  const listenCheckpoint = getListenCheckpoint(engine);
  if (
    (classification.intentId === "silence" || classification.intentId === "didnt_understand") &&
    listenCheckpoint
  ) {
    const retries = (ctx.silenceRetries ?? 0) + 1;
    ctx.silenceRetries = retries;
    if (retries > GRAPH_SILENCE_MAX_RETRIES) {
      logger.info({ callId, retries }, "Max silence retries — ending call");
      return hangUpAfterSilenceRetries(callId, call, engine, ctx);
    }
    return repeatGraphQuestionAtListen(callId, call, engine, ctx);
  }

  const graph = engine.getGraph();
  const listenId = getListenCheckpoint(engine);

  if (
    listenId &&
    text.trim() &&
    (classification.intentId === "greeting_hi" || classification.intentId === "greeting_ack") &&
    !isMainPathAnswer(graph, listenId, classification, thresholds)
  ) {
    return repeatGraphQuestionAtListen(callId, call, engine, ctx);
  }

  const inSideFlow = isInSideFlow(ctx, engine);

  if (inSideFlow && listenId && text.trim()) {
    const sideResult = await processSideFlowTurn(
      callId,
      call,
      engine,
      text,
      classification,
      ctx,
      thresholds,
    );
    if (sideResult) return sideResult;
  }

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
    await persistGraphTurn(callId, engine, ctx, sayText, speakNode?.id, {
      externalCallId: call.externalCallId,
    });
    return { sayText, endCall: false };
  }

  let routedClassification = classification;
  const listenNodeAtTurn = engine.getCurrentNode();
  const activeListenId =
    listenNodeAtTurn?.type === "listen" ? listenNodeAtTurn.id : listenCheckpoint;

  if (classification.intentId === "provide_address" && activeListenId !== "listen_address") {
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
  }
  if (node?.type === "decision") {
    node = engine.advanceByDecision(ctx.variables ?? {}) ?? undefined;
  }
  if (node?.type === "intent_route" && node.id === "route_fiber") {
    const address = String(ctx.variables?.CustomerAddress ?? "").trim();
    if (address) {
      const available = await lookupFiberAvailability(address);
      routedClassification = {
        intentId: available ? "fiber_available" : "fiber_unavailable",
        confidence: 1,
        entities: {},
        classifier: "rule",
      };
      node = engine.advanceByClassification(routedClassification, thresholds) ?? undefined;
    }
  }

  let sayText = ctx.lastSpokenText || "אשמח להמשיך לעזור לך.";
  const spokenParts: string[] = [];
  let lastSpeakNodeId: string | undefined;

  while (node?.type === "speak" && !node.id.startsWith("goodbye_")) {
    lastSpeakNodeId = node.id;
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

  while (isOrphanAnnouncementRoute(engine)) {
    node = advanceOrphanAnnouncementRoute(engine) ?? undefined;
    while (node?.type === "speak" && !node.id.startsWith("goodbye_")) {
      lastSpeakNodeId = node.id;
      const part = await speakFromNode(
        node,
        call.contact,
        undefined,
        undefined,
        undefined,
        ctx.variables,
      );
      spokenParts.push(part);
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
  }

  if (spokenParts.length > 0) {
    sayText = spokenParts.join(" ");
    ctx.lastSpokenText = spokenParts[spokenParts.length - 1]!;
  }

  if (node?.type === "speak" && node.id.startsWith("goodbye_")) {
    lastSpeakNodeId = node.id;
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

    await persistGraphTurn(callId, engine, ctx, sayText, lastSpeakNodeId, {
      externalCallId: call.externalCallId,
    });

    const endOutcome =
      outcome === "sold" || outcome === "refused" || outcome === "callback" ? outcome : "none";
    return {
      sayText,
      endCall: true,
      pendingOutcome: endOutcome,
    };
  }

  await persistGraphTurn(callId, engine, ctx, sayText, lastSpeakNodeId, {
    externalCallId: call.externalCallId,
  });
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
    return { sayText: closingText, endCall: true, pendingOutcome: outcome };
  }

  engine.markSpokenOffset(engine.currentStageId, 0);
  const next = engine.advance();
  await prisma.call.update({
    where: { id: callId },
    data: { currentStage: next?.id ?? engine.currentStageId },
  });

  await addTranscript(callId, "ai", reply.text);
  return { sayText: reply.text, endCall: false };
}

export async function handleCustomerSpeech(callId: string, text: string) {
  queuedCustomerSpeech.set(callId, text);

  if (text.trim()) {
    await interruptAiPlayback(callId);
  }

  let worker = customerSpeechWorkers.get(callId);
  if (!worker) {
    worker = drainCustomerSpeechQueue(callId);
    customerSpeechWorkers.set(callId, worker);
  }
  await worker;
}

async function drainCustomerSpeechQueue(callId: string): Promise<void> {
  try {
    while (queuedCustomerSpeech.has(callId)) {
      const next = queuedCustomerSpeech.get(callId)!;
      queuedCustomerSpeech.delete(callId);
      await runCustomerSpeechTurn(callId, next);
    }
  } finally {
    customerSpeechWorkers.delete(callId);
    if (queuedCustomerSpeech.has(callId)) {
      const followUp = drainCustomerSpeechQueue(callId);
      customerSpeechWorkers.set(callId, followUp);
      await followUp;
    }
  }
}

async function runCustomerSpeechTurn(callId: string, text: string) {
  const callMeta = await prisma.call.findUnique({
    where: { id: callId },
    select: { externalCallId: true },
  });
  const isTwilio =
    callMeta?.externalCallId &&
    !callMeta.externalCallId.startsWith("mock-") &&
    !isTestCall(callMeta.externalCallId);

  clearGraphSilence(callId);
  clearStagedSilence(callId);
  const session = activeSessions.get(callId);

  if (text.trim()) {
    session?.tts?.abort();
    if (isTwilio) {
      await interruptTwilioPlay(callId);
      clearAiPlayback(callId);
    } else if (!isStreamingTtsOnCall(callId)) {
      clearPlayback(callId);
      stopBrowserPlayback(callId);
      clearAiPlayback(callId);
    }
  } else if (shouldDeferForAiPlayback(callId)) {
    deferGraphSilenceUntilAiDone(callId);
    return;
  } else if (isTwilio && !isStreamingTtsOnCall(callId)) {
    await interruptTwilioPlay(callId);
    session?.tts?.abort();
    clearAiPlayback(callId);
  } else if (!isStreamingTtsOnCall(callId)) {
    session?.tts?.abort();
    clearPlayback(callId);
    stopBrowserPlayback(callId);
    clearAiPlayback(callId);
  }

  startThinkingFeedback(callId, Boolean(isTwilio));
  let turn: VoiceTurnResult;
  try {
    turn = await processCustomerTurn(callId, text);
  } catch (err) {
    logger.error({ err, callId }, "processCustomerTurn failed");
    stopThinkingFeedback(callId, Boolean(isTwilio));
    turn = { sayText: "סליחה, אירעה שגיאה. אשמח לנסות שוב.", endCall: false };
  }

  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { contact: true },
  });
  const ttsOpts = { addresseeSex: call?.contact?.sex };

  let playbackMs = 0;
  let playbackKind: AiPlaybackKind = "twiml";

  if (isTwilio) {
    try {
      if (turn.sayText.trim()) {
        const played = await playOnTwilioCall(callId, turn.sayText, turn.endCall);
        playbackMs = played.durationMs;
        if (!played.ok) {
          logger.error({ callId }, "Twilio reply play failed");
          stopThinkingFeedback(callId, true);
        }
      } else {
        stopThinkingFeedback(callId, true);
      }
    } catch (err) {
      logger.error({ err, callId }, "Twilio reply play failed");
      stopThinkingFeedback(callId, true);
    }

    if (turn.pendingOutcome !== undefined) {
      if (turn.pendingOutcome === "none") {
        await updateCallStatus(callId, "ended", "none");
      } else {
        await finalizeCall(callId, turn.pendingOutcome);
      }
    }
    if (!turn.endCall) {
      scheduleGraphSilenceAfterPlayback(callId, playbackMs, playbackKind);
    }
    return;
  }

    if (isTestCall(call?.externalCallId)) {
      if (turn.endCall && turn.pendingOutcome !== undefined) {
        setBrowserPendingCallEnd(callId, turn.pendingOutcome);
      }
      const played = await speakToBrowser(callId, turn.sayText, false, ttsOpts);
      if (turn.endCall && turn.pendingOutcome !== undefined && (!played.played || !turn.sayText.trim())) {
        await completePendingCallEnd(callId);
      }
      if (!turn.endCall) {
        scheduleGraphSilenceAfterPlayback(callId, played.played ? played.durationMs : 0);
      }
      return;
    }

    if (turn.endCall) return;

    const replyTts = new TtsSession();
    const updated = activeSessions.get(callId);
    if (updated) updated.tts = replyTts;
    playbackMs = await speakOnCall(callId, turn.sayText, replyTts, ttsOpts);
    if (!turn.endCall) {
      scheduleGraphSilenceAfterPlayback(callId, playbackMs);
    }
}

export async function rewindTestCallStep(callId: string): Promise<{ sayText: string; currentNodeId: string }> {
  stopBrowserPlayback(callId);
  clearStagedSilence(callId);
  clearGraphSilence(callId);

  const result = await computeTestCallRewind(callId);
  const session = activeSessions.get(callId);
  if (session?.session.mode === "graph") {
    session.session.engine.replaceGraph(result.engine.getGraph(), result.currentNodeId);
  } else {
    activeSessions.set(callId, { session: { mode: "graph", engine: result.engine } });
  }

  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { contact: true },
  });

  await speakToBrowser(callId, result.sayText, false, {
    addresseeSex: call?.contact?.sex,
  });

  return { sayText: result.sayText, currentNodeId: result.currentNodeId };
}

export { canRewindTestCall };

export async function handleBargeIn(callId: string, audioChunk: Buffer | null) {
  if (audioChunk && audioChunk.length > 0 && !detectVoiceActivity(audioChunk)) return;
  if (!isAiSpeaking(callId) && !isStreamingTtsOnCall(callId)) return;
  await interruptAiPlayback(callId);
  logger.info({ callId }, "Barge-in: stopped AI playback to listen");
}

export async function addTranscript(
  callId: string,
  speaker: string,
  text: string,
  flowNodeId?: string | null,
) {
  return prisma.callTranscriptSegment.create({
    data: { callId, speaker, text, flowNodeId: flowNodeId ?? null },
  }).then((segment) => {
    broadcastCallEvent({
      type: "transcript",
      callId,
      speaker,
      text,
      ...(flowNodeId ? { flowNodeId } : {}),
    });
    return segment;
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

  const isTwilio =
    call?.externalCallId &&
    !call.externalCallId.startsWith("mock-") &&
    !isTestCall(call.externalCallId);

  stopBrowserPlayback(callId);
  stopThinkingFeedback(callId, Boolean(isTwilio));
  clearPlayback(callId);
  activeSessions.delete(callId);
  voiceSessionsStarted.delete(callId);
  voiceKickoffStarted.delete(callId);
  browserTestCallIds.delete(callId);
  browserTestKickoffDone.delete(callId);
  clearBrowserTestSkipVoice(callId);
  clearStagedSilence(callId);
  clearGraphSilence(callId);
  clearAiPlayback(callId);

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

async function replayLastAiSpeechToBrowser(callId: string): Promise<void> {
  const last = await prisma.callTranscriptSegment.findFirst({
    where: { callId, speaker: "ai" },
    orderBy: { timestamp: "desc" },
  });
  if (!last?.text.trim()) return;
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { contact: true },
  });
  await speakToBrowser(callId, last.text, false, {
    addresseeSex: call?.contact?.sex,
  });
}

/** First WS `start` prepares the opening; reconnects replay the latest AI line without re-advancing flow. */
async function handleBrowserTestSessionStart(callId: string): Promise<void> {
  if (browserTestKickoffInFlight.has(callId)) return;
  if (!hasBrowserSession(callId)) return;

  if (browserTestKickoffDone.has(callId)) {
    await replayLastAiSpeechToBrowser(callId);
    return;
  }

  const existingAi = await prisma.callTranscriptSegment.findFirst({
    where: { callId, speaker: "ai" },
    orderBy: { timestamp: "desc" },
  });
  if (existingAi?.text.trim()) {
    browserTestKickoffDone.add(callId);
    voiceSessionsStarted.add(callId);
    await speakToBrowser(callId, existingAi.text, false, {
      addresseeSex: (
        await prisma.call.findUnique({
          where: { id: callId },
          include: { contact: true },
        })
      )?.contact?.sex,
    });
    return;
  }

  browserTestKickoffInFlight.add(callId);
  try {
    voiceSessionsStarted.add(callId);
    const turn = await prepareInitialVoiceTurn(callId);
    if (!turn.sayText.trim()) return;
    const call = await prisma.call.findUnique({
      where: { id: callId },
      include: { contact: true },
    });
    const played = await speakToBrowser(callId, turn.sayText, false, {
      addresseeSex: call?.contact?.sex,
    });
    if (played.played) {
      browserTestKickoffDone.add(callId);
    }
  } finally {
    browserTestKickoffInFlight.delete(callId);
  }
}

registerVoiceHandlers({
  onCustomerSpeech: handleCustomerSpeech,
  onBargeIn: handleBargeIn,
  isAiPlaybackActive: (callId) => isAiSpeaking(callId) || isStreamingTtsOnCall(callId),
});

registerMediaStreamCallbacks({
  onStreamStart: async (callId) => {
    voiceSessionsStarted.add(callId);
    logger.info({ callId }, "Twilio media stream ready — STT active");
    if (voiceKickoffStarted.has(callId)) return;
    voiceKickoffStarted.add(callId);
    try {
      const preloaded = peekPreloadedOpening(callId);
      await prepareInitialVoiceTurn(callId, { precomputedSayText: preloaded?.sayText });
      preloadedOpeningClips.delete(callId);
      const remaining = aiPlaybackRemainingMs(callId);
      if (remaining > 0) {
        deferGraphSilenceUntilAiDone(callId);
      } else {
        maybeScheduleGraphSilenceForCall(callId);
      }
    } catch (err) {
      logger.error({ err, callId }, "voice session setup failed");
    }
  },
});

registerBrowserTestHandlers({
  onCustomerSpeech: handleCustomerSpeech,
  onSessionStart: handleBrowserTestSessionStart,
  onSessionEnd: async (callId) => {
    voiceSessionsStarted.delete(callId);
  },
  onPlaybackIdle: (callId) => {
    clearAiPlayback(callId);
    onAiPlaybackEnded(callId);
  },
  onPendingCallEnd: async (callId, outcome) => {
    if (outcome === "none") {
      await updateCallStatus(callId, "ended", "none");
    } else {
      await finalizeCall(callId, outcome);
    }
  },
});
