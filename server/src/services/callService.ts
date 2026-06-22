import { prisma } from "../db.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  createEngineFromFlow,
  getActiveCallFlow,
  parseCallFlow,
  previewOpeningLine,
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
import type { CallOutcome, CallStatus } from "@prisma/client";

export type VoiceTurnResult = { sayText: string; endCall: boolean };

const activeSessions = new Map<
  string,
  { tts?: TtsSession; engine: ReturnType<typeof createEngineFromFlow> }
>();
const voiceSessionsStarted = new Set<string>();

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
  const call = await prisma.call.create({
    data: {
      contactId,
      flowVersionId: flow.id,
      status: "dialing",
      currentStage: JSON.parse(flow.stagesJson)[0]?.id ?? "greeting",
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
    if (call.contact.status === "in_call") {
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

  const parsed = parseCallFlow(call.callFlow);
  const opening = previewOpeningLine(
    parsed.openingTemplate,
    contactFullName(call.contact.firstName, call.contact.familyName),
  );
  const engine = createEngineFromFlow(call.callFlow);
  activeSessions.set(callId, { engine });

  let sayText = opening;
  const stage = engine.getCurrentStage();
  if (stage) {
    const reply = await generateSalesReply(stage.prompt, {
      customerFirstName: call.contact.firstName,
      stagePrompt: stage.prompt,
      isOpeningTurn: true,
    });
    sayText = `${opening} ${reply.text}`;
  }

  await addTranscript(callId, "ai", sayText);
  broadcastCallEvent({ type: "transcript", callId, speaker: "ai", text: sayText });

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

  await addTranscript(callId, "customer", text);
  broadcastCallEvent({ type: "transcript", callId, speaker: "customer", text });

  const session = activeSessions.get(callId);
  const engine =
    session?.engine ?? createEngineFromFlow(call.callFlow, call.currentStage ?? undefined);
  if (!session) {
    activeSessions.set(callId, { engine });
  }

  const stage = engine.getCurrentStage();
  const reply = await generateSalesReply(text, {
    customerFirstName: call.contact.firstName,
    stagePrompt: stage?.prompt ?? "",
  });

  const outcome = reply.outcome ?? detectOutcome(text);

  if (outcome === "refused" || outcome === "sold" || outcome === "callback") {
    await addTranscript(callId, "ai", reply.text);
    broadcastCallEvent({ type: "transcript", callId, speaker: "ai", text: reply.text });
    await finalizeCall(callId, outcome);
    return { sayText: reply.text, endCall: true };
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
  });
  const summary = `תוצאה: ${outcome}. ${segments.length} קטעי שיחה.`;
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
      transcript: { orderBy: { timestamp: "asc" } },
    },
  });
  if (!call) throw new AppError(404, "שיחה לא נמצאה");
  return call;
}

export async function getActiveCall() {
  return prisma.call.findFirst({
    where: { status: { in: ["dialing", "ringing", "connected"] } },
    include: { contact: true, transcript: { orderBy: { timestamp: "asc" } } },
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
