import twilio from "twilio";
import { createPlayClip } from "./playAudio.js";
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

/** Play ElevenLabs audio, keep call open, listen via Deepgram on background media stream. */
export function buildPlayListenTwiml(
  callId: string,
  playUrl: string,
  endCall: boolean,
  base: string,
): string {
  const escapedPlay = escapeXml(playUrl);

  if (endCall) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${streamBlock(callId, base)}
  <Play>${escapedPlay}</Play>
  <Hangup/>
</Response>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${streamBlock(callId, base)}
  <Play>${escapedPlay}</Play>
  <Pause length="600"/>
</Response>`;
}

export async function buildTwimlForSpeech(
  callId: string,
  text: string,
  endCall: boolean,
): Promise<string | null> {
  const clipId = await createPlayClip(text);
  if (!clipId) return null;
  const base = await resolveWebhookBaseUrl();
  const playUrl = `${base}/api/webhooks/twilio/audio/${clipId}`;
  return buildPlayListenTwiml(callId, playUrl, endCall, base);
}

export async function playOnTwilioCall(
  callId: string,
  text: string,
  endCall: boolean,
): Promise<boolean> {
  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call?.externalCallId || call.externalCallId.startsWith("mock-")) return false;

  const twiml = await buildTwimlForSpeech(callId, text, endCall);
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
