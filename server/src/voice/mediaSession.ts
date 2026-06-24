import type WebSocket from "ws";
import { getAiConfig } from "../services/settingsService.js";
import { logger } from "../logger.js";
import { DeepgramSttSession } from "./deepgramStt.js";
import { synthesizeHebrewSpeech, type TtsOptions } from "./tts.js";
import type { TtsSession } from "./tts.js";

const MULAW_CHUNK_BYTES = 160; // 20 ms @ 8 kHz μ-law

type SpeechHandler = (callId: string, text: string) => Promise<void>;
type BargeInHandler = (callId: string, audio: Buffer) => Promise<void>;

let onCustomerSpeech: SpeechHandler = async () => {};
let onBargeIn: BargeInHandler = async () => {};
let onStreamStart: (callId: string) => Promise<void> = async () => {};

export function registerVoiceHandlers(handlers: {
  onCustomerSpeech: SpeechHandler;
  onBargeIn: BargeInHandler;
}): void {
  onCustomerSpeech = handlers.onCustomerSpeech;
  onBargeIn = handlers.onBargeIn;
}

export function registerMediaStreamCallbacks(handlers: {
  onStreamStart: (callId: string) => Promise<void>;
}): void {
  onStreamStart = handlers.onStreamStart;
}

interface MediaSession {
  callId: string;
  streamSid: string;
  twilioWs: WebSocket;
  stt: DeepgramSttSession | null;
  isSpeaking: boolean;
  lastFinalTranscript: string;
  lastFinalAt: number;
  processingSpeech: boolean;
}

const sessions = new Map<string, MediaSession>();
const wsToCallId = new WeakMap<WebSocket, string>();

function resolveCallIdFromStart(message: {
  start?: { customParameters?: Record<string, string>; streamSid?: string };
}): string | null {
  const params = message.start?.customParameters;
  if (!params) return null;
  return params.callId ?? params.CallId ?? null;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });
}

async function createSttSession(callId: string): Promise<DeepgramSttSession | null> {
  const config = await getAiConfig();
  if (!config.deepgramApiKey) return null;

  const stt = new DeepgramSttSession(config.deepgramApiKey, (text, isFinal) => {
    void onSttTranscript(callId, text, isFinal);
  });

  try {
    await stt.connect();
    logger.info({ callId }, "Deepgram Hebrew STT connected");
    return stt;
  } catch (err) {
    logger.error({ err, callId }, "Failed to start Deepgram STT");
    stt.close();
    return null;
  }
}

async function onSttTranscript(callId: string, text: string, isFinal: boolean) {
  if (!isFinal || !text.trim()) return;

  const session = sessions.get(callId);
  if (!session) return;

  const now = Date.now();
  if (text === session.lastFinalTranscript && now - session.lastFinalAt < 3000) return;
  if (session.processingSpeech) return;

  session.lastFinalTranscript = text;
  session.lastFinalAt = now;
  session.processingSpeech = true;

  logger.info({ callId, text }, "Deepgram Hebrew transcript (final)");

  try {
    await onCustomerSpeech(callId, text);
  } finally {
    session.processingSpeech = false;
  }
}

export async function handleTwilioMediaMessage(
  twilioWs: WebSocket,
  message: {
    event?: string;
    streamSid?: string;
    start?: { customParameters?: Record<string, string>; streamSid?: string };
    media?: { payload?: string; track?: string };
  },
): Promise<void> {
  let callId = wsToCallId.get(twilioWs) ?? null;

  if (message.event === "start") {
    callId = resolveCallIdFromStart(message);
    const streamSid = message.streamSid ?? message.start?.streamSid;
    if (!callId || !streamSid) {
      logger.error({ message }, "Twilio media stream start missing callId or streamSid");
      return;
    }

    const existing = sessions.get(callId);
    if (existing) {
      existing.stt?.close();
      wsToCallId.delete(existing.twilioWs);
    }

    const stt = await createSttSession(callId);
    wsToCallId.set(twilioWs, callId);
    sessions.set(callId, {
      callId,
      streamSid,
      twilioWs,
      stt,
      isSpeaking: false,
      lastFinalTranscript: "",
      lastFinalAt: 0,
      processingSpeech: false,
    });
    logger.info({ callId, streamSid, hasStt: Boolean(stt) }, "Twilio media stream started (Deepgram he)");
    void onStreamStart(callId);
    return;
  }

  if (!callId) return;

  const session = sessions.get(callId);
  if (!session) return;

  if (message.event === "media" && message.media?.payload) {
    const audio = Buffer.from(message.media.payload, "base64");
    const track = message.media.track ?? "inbound";
    if (track === "inbound" || !message.media.track) {
      session.stt?.sendAudio(audio);
      if (session.isSpeaking) {
        await onBargeIn(callId, audio);
      }
    }
    return;
  }

  if (message.event === "stop") {
    if (session.twilioWs === twilioWs) {
      unregisterMediaStream(callId);
    }
  }
}

export function unregisterMediaStream(callId: string): void {
  const session = sessions.get(callId);
  if (!session) return;
  session.stt?.close();
  sessions.delete(callId);
  wsToCallId.delete(session.twilioWs);
  logger.info({ callId }, "Twilio media stream ended");
}

export function unregisterMediaStreamForWs(twilioWs: WebSocket): void {
  const callId = wsToCallId.get(twilioWs);
  if (callId) unregisterMediaStream(callId);
}

export function clearPlayback(callId: string): void {
  const session = sessions.get(callId);
  if (!session?.streamSid || session.twilioWs.readyState !== 1) return;

  session.twilioWs.send(
    JSON.stringify({
      event: "clear",
      streamSid: session.streamSid,
    }),
  );
  session.isSpeaking = false;
}

export async function speakOnCall(
  callId: string,
  text: string,
  tts: TtsSession,
  options?: TtsOptions,
): Promise<void> {
  const session = sessions.get(callId);
  if (!session || !text.trim()) return;

  const audio = await synthesizeHebrewSpeech(text, options);
  if (!audio || tts.isAborted()) {
    logger.warn({ callId, hasAudio: Boolean(audio) }, "speakOnCall skipped — no TTS audio");
    return;
  }

  session.isSpeaking = true;
  const signal = tts.getSignal();
  logger.info({ callId, bytes: audio.length }, "Streaming TTS to caller");

  try {
    for (let offset = 0; offset < audio.length; offset += MULAW_CHUNK_BYTES) {
      if (signal.aborted || session.twilioWs.readyState !== 1) break;

      const chunk = audio.subarray(offset, offset + MULAW_CHUNK_BYTES);
      session.twilioWs.send(
        JSON.stringify({
          event: "media",
          streamSid: session.streamSid,
          media: { payload: chunk.toString("base64") },
        }),
      );

      try {
        await sleep(20, signal);
      } catch {
        break;
      }
    }
  } finally {
    session.isSpeaking = false;
  }
}

export function hasMediaSession(callId: string): boolean {
  return sessions.has(callId);
}

export async function waitForMediaSession(callId: string, maxMs = 10000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (sessions.has(callId)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}
