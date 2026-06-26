import twilio from "twilio";
import { createPlayClip, ensureThinkingClip, getPlayClipDurationMs } from "./playAudio.js";
import type { TtsOptions } from "./tts.js";
import { getTelephonyConfig } from "../services/settingsService.js";
import { prisma } from "../db.js";
import { logger } from "../logger.js";

async function resolveWebhookBaseUrl(): Promise<string> {
  const config = await getTelephonyConfig();
  return config.webhookBaseUrl ?? process.env.TWILIO_WEBHOOK_BASE_URL ?? "http://localhost:3001";
}

function mediaStreamWsUrl(base: string): string {
  const wsBase = base.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  return `${wsBase}/api/webhooks/twilio/media`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function streamBlock(callId: string, base: string): string {
  const streamUrl = escapeXml(mediaStreamWsUrl(base));
  const escapedCallId = escapeXml(callId);
  return `<Start><Stream url="${streamUrl}"><Parameter name="callId" value="${escapedCallId}"/></Stream></Start>`;
}

/** Bidirectional stream — required to send TTS and thinking audio back to the caller. */
function connectStreamBlock(callId: string, base: string): string {
  const streamUrl = escapeXml(mediaStreamWsUrl(base));
  const escapedCallId = escapeXml(callId);
  return `<Connect>
    <Stream url="${streamUrl}">
      <Parameter name="callId" value="${escapedCallId}"/>
    </Stream>
  </Connect>`;
}

export async function buildAnswerConnectStreamTwiml(callId: string): Promise<string> {
  const base = await resolveWebhookBaseUrl();
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${connectStreamBlock(callId, base)}
</Response>`;
}

export async function buildHoldTwiml(callId: string): Promise<string> {
  return buildAnswerConnectStreamTwiml(callId);
}

/** Stop an in-flight TwiML &lt;Play&gt; without restarting the media stream. */
export function buildPauseOnlyTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="600"/>
</Response>`;
}

/**
 * Play ElevenLabs audio while keeping the call open.
 * @param withStream Start a new media stream — only on the first TwiML (answer webhook).
 *   Mid-call updates must omit Start; Twilio keeps the existing stream alive.
 */
export function buildPlayListenTwiml(
  callId: string,
  playUrl: string,
  endCall: boolean,
  base: string,
  withStream = false,
): string {
  const escapedPlay = escapeXml(playUrl);
  const stream = withStream ? `${streamBlock(callId, base)}\n  ` : "";

  if (endCall) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${stream}<Play>${escapedPlay}</Play>
  <Hangup/>
</Response>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${stream}<Play>${escapedPlay}</Play>
  <Pause length="600"/>
</Response>`;
}

/** First answer TwiML: start Deepgram media stream and play preloaded opening audio. */
export async function buildAnswerWithPlayTwiml(callId: string, clipId: string): Promise<string> {
  const base = await resolveWebhookBaseUrl();
  const playUrl = `${base}/api/webhooks/twilio/audio/${clipId}`;
  return buildPlayListenTwiml(callId, playUrl, false, base, true);
}

/** Answer before opening clip is ready: start STT stream and hold until playPreloadedOnTwilioCall runs. */
export async function buildAnswerHoldTwiml(callId: string): Promise<string> {
  const base = await resolveWebhookBaseUrl();
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${streamBlock(callId, base)}
  <Pause length="600"/>
</Response>`;
}

export async function buildTwimlForSpeech(
  callId: string,
  text: string,
  endCall: boolean,
  ttsOptions?: TtsOptions,
): Promise<{ twiml: string; durationMs: number } | null> {
  const clip = await createPlayClip(text, ttsOptions);
  if (!clip) return null;
  const base = await resolveWebhookBaseUrl();
  const playUrl = `${base}/api/webhooks/twilio/audio/${clip.id}`;
  return {
    twiml: buildPlayListenTwiml(callId, playUrl, endCall, base, false),
    durationMs: clip.durationMs,
  };
}

export type TwilioPlayResult = { ok: boolean; durationMs: number };

function isTwilioCallEndedError(err: unknown): boolean {
  const code = (err as { code?: number })?.code;
  return code === 21220 || code === 20404;
}

async function safeUpdateTwilioCall(
  externalCallId: string,
  update: Parameters<ReturnType<ReturnType<typeof twilio>["calls"]>["update"]>[0],
  callId?: string,
): Promise<boolean> {
  const config = await getTelephonyConfig();
  if (!config.accountSid || !config.authToken) return false;

  const client = twilio(config.accountSid, config.authToken);
  try {
    await client.calls(externalCallId).update(update);
    return true;
  } catch (err) {
    if (isTwilioCallEndedError(err)) {
      logger.debug({ callId, externalCallId }, "Twilio call update skipped — call not in progress");
      return false;
    }
    throw err;
  }
}

export async function playOnTwilioCall(
  callId: string,
  text: string,
  endCall: boolean,
): Promise<TwilioPlayResult> {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { contact: true },
  });
  if (!call?.externalCallId || call.externalCallId.startsWith("mock-")) {
    return { ok: false, durationMs: 0 };
  }

  const built = await buildTwimlForSpeech(callId, text, endCall, {
    addresseeSex: call.contact?.sex,
  });
  if (!built) {
    logger.warn({ callId }, "No ElevenLabs audio — Twilio play skipped");
    return { ok: false, durationMs: 0 };
  }

  await interruptTwilioPlay(callId);
  const ok = await safeUpdateTwilioCall(call.externalCallId, { twiml: built.twiml }, callId);
  if (!ok) return { ok: false, durationMs: 0 };
  logger.info({ callId, endCall, durationMs: built.durationMs }, "ElevenLabs audio queued on Twilio call");
  return { ok: true, durationMs: built.durationMs };
}

/** Loop thinking tone on the call while the LLM generates a reply (stopped before TTS play). */
export async function playThinkingOnTwilioCall(callId: string): Promise<void> {
  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call?.externalCallId || call.externalCallId.startsWith("mock-")) return;

  const clipId = ensureThinkingClip();
  const base = await resolveWebhookBaseUrl();
  const playUrl = escapeXml(`${base}/api/webhooks/twilio/audio/${clipId}`);
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play loop="0">${playUrl}</Play>
  <Pause length="600"/>
</Response>`;

  const ok = await safeUpdateTwilioCall(call.externalCallId, { twiml }, callId);
  if (ok) logger.info({ callId }, "Thinking tone started on Twilio call");
}

export async function interruptTwilioPlay(callId: string): Promise<void> {
  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call?.externalCallId || call.externalCallId.startsWith("mock-")) return;

  const twiml = buildPauseOnlyTwiml();
  const ok = await safeUpdateTwilioCall(call.externalCallId, { twiml }, callId);
  if (ok) logger.info({ callId }, "Twilio play interrupted — pause only (stream kept)");
}

export async function hangupTwilioCall(externalCallId: string): Promise<void> {
  const ok = await safeUpdateTwilioCall(externalCallId, { status: "completed" });
  if (ok) logger.info({ externalCallId }, "Twilio call hung up");
}

export async function playPreloadedOnTwilioCall(
  callId: string,
  clipId: string,
  endCall: boolean,
  durationMs?: number,
): Promise<TwilioPlayResult> {
  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call?.externalCallId || call.externalCallId.startsWith("mock-")) {
    return { ok: false, durationMs: 0 };
  }

  const base = await resolveWebhookBaseUrl();
  const playUrl = `${base}/api/webhooks/twilio/audio/${clipId}`;
  const twiml = buildPlayListenTwiml(callId, playUrl, endCall, base, false);

  const ok = await safeUpdateTwilioCall(call.externalCallId, { twiml }, callId);
  if (!ok) return { ok: false, durationMs: 0 };
  const playbackMs = durationMs ?? getPlayClipDurationMs(clipId);
  logger.info({ callId, clipId, endCall, durationMs: playbackMs }, "Preloaded opening audio queued on Twilio call (stream kept)");
  return { ok: true, durationMs: playbackMs };
}
