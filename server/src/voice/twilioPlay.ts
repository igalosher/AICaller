import twilio from "twilio";
import { createPlayClip } from "./playAudio.js";
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

export async function buildHoldTwiml(callId: string): Promise<string> {
  const base = await resolveWebhookBaseUrl();
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${streamBlock(callId, base)}
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

export async function buildTwimlForSpeech(
  callId: string,
  text: string,
  endCall: boolean,
  ttsOptions?: TtsOptions,
): Promise<string | null> {
  const clipId = await createPlayClip(text, ttsOptions);
  if (!clipId) return null;
  const base = await resolveWebhookBaseUrl();
  const playUrl = `${base}/api/webhooks/twilio/audio/${clipId}`;
  return buildPlayListenTwiml(callId, playUrl, endCall, base, false);
}

export async function playOnTwilioCall(
  callId: string,
  text: string,
  endCall: boolean,
): Promise<boolean> {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { contact: true },
  });
  if (!call?.externalCallId || call.externalCallId.startsWith("mock-")) return false;

  const twiml = await buildTwimlForSpeech(callId, text, endCall, {
    addresseeSex: call.contact?.sex,
  });
  if (!twiml) {
    logger.warn({ callId }, "No ElevenLabs audio — Twilio play skipped");
    return false;
  }

  const config = await getTelephonyConfig();
  if (!config.accountSid || !config.authToken) return false;

  const client = twilio(config.accountSid, config.authToken);
  await client.calls(call.externalCallId).update({ twiml });
  logger.info({ callId, endCall }, "ElevenLabs audio queued on Twilio call");
  return true;
}

export async function hangupTwilioCall(externalCallId: string): Promise<void> {
  const config = await getTelephonyConfig();
  if (!config.accountSid || !config.authToken) return;

  const client = twilio(config.accountSid, config.authToken);
  await client.calls(externalCallId).update({ status: "completed" });
  logger.info({ externalCallId }, "Twilio call hung up");
}

export async function playPreloadedOnTwilioCall(
  callId: string,
  clipId: string,
  endCall: boolean,
): Promise<boolean> {
  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call?.externalCallId || call.externalCallId.startsWith("mock-")) return false;

  const config = await getTelephonyConfig();
  if (!config.accountSid || !config.authToken) return false;

  const base = await resolveWebhookBaseUrl();
  const playUrl = `${base}/api/webhooks/twilio/audio/${clipId}`;
  const twiml = buildPlayListenTwiml(callId, playUrl, endCall, base, false);

  const client = twilio(config.accountSid, config.authToken);
  await client.calls(call.externalCallId).update({ twiml });
  logger.info({ callId, clipId, endCall }, "Preloaded opening audio queued on Twilio call (stream kept)");
  return true;
}
