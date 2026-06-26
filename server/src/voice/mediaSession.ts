import type WebSocket from "ws";
import { getAiConfig } from "../services/settingsService.js";
import { logger } from "../logger.js";
import { DeepgramSttSession } from "./deepgramStt.js";
import { synthesizeHebrewSpeech, type TtsOptions } from "./tts.js";
import type { TtsSession } from "./tts.js";
import { streamThinkingMulaw, type ThinkingSession } from "./thinkingSound.js";

const MULAW_CHUNK_BYTES = 160; // 20 ms @ 8 kHz μ-law

/** Minimum interim transcript length before barge-in (avoids noise false-positives). */
const BARGE_IN_INTERIM_MIN_CHARS = 4;

type SpeechHandler = (callId: string, text: string) => Promise<void>;
type BargeInHandler = (callId: string, audio: Buffer | null) => Promise<void>;

let onCustomerSpeech: SpeechHandler = async () => {};
let onBargeIn: BargeInHandler = async () => {};
let onStreamStart: (callId: string) => Promise<void> = async () => {};
let isAiPlaybackActive: (callId: string) => boolean = () => false;

export function registerVoiceHandlers(handlers: {
  onCustomerSpeech: SpeechHandler;
  onBargeIn: BargeInHandler;
  isAiPlaybackActive?: (callId: string) => boolean;
}): void {
  onCustomerSpeech = handlers.onCustomerSpeech;
  onBargeIn = handlers.onBargeIn;
  isAiPlaybackActive = handlers.isAiPlaybackActive ?? (() => false);
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
  thinking: ThinkingSession | null;
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
  const trimmed = text.trim();
  if (!trimmed) return;

  const session = sessions.get(callId);
  if (!session) return;

  const aiActive = isAiPlaybackActive(callId) || session.isSpeaking;

  if (!isFinal) {
    if (aiActive && trimmed.length >= BARGE_IN_INTERIM_MIN_CHARS) {
      await onBargeIn(callId, null);
    }
    return;
  }

  const now = Date.now();
  if (trimmed === session.lastFinalTranscript && now - session.lastFinalAt < 3000) return;

  session.lastFinalTranscript = trimmed;
  session.lastFinalAt = now;

  logger.info({ callId, text: trimmed }, "Deepgram Hebrew transcript (final)");

  if (aiActive) {
    await onBargeIn(callId, null);
  }

  await onCustomerSpeech(callId, trimmed);
}

/** Pre-warm Deepgram STT so the first media stream does not block on connect. */
export async function warmDeepgramStt(): Promise<void> {
  const config = await getAiConfig();
  if (!config.deepgramApiKey) return;

  const stt = new DeepgramSttSession(config.deepgramApiKey, () => {});
  try {
    await stt.connect();
    logger.info("Deepgram STT warm-up complete");
  } catch (err) {
    logger.warn({ err }, "Deepgram STT warm-up failed");
  } finally {
    stt.close();
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
    const startedCallId = callId;

    const existing = sessions.get(startedCallId);
    if (existing) {
      existing.stt?.close();
      existing.thinking?.stop();
      wsToCallId.delete(existing.twilioWs);
    }

    wsToCallId.set(twilioWs, startedCallId);
    sessions.set(startedCallId, {
      callId: startedCallId,
      streamSid,
      twilioWs,
      stt: null,
      isSpeaking: false,
      lastFinalTranscript: "",
      lastFinalAt: 0,
      thinking: null,
    });
    logger.info({ callId: startedCallId, streamSid }, "Twilio media stream started (Deepgram he)");
    void onStreamStart(startedCallId);

    void createSttSession(startedCallId).then((stt) => {
      const session = sessions.get(startedCallId);
      if (session && session.twilioWs === twilioWs) {
        session.stt = stt;
      } else {
        stt?.close();
      }
    });
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
  session.thinking?.stop();
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

export function stopThinkingOnCall(callId: string): void {
  const session = sessions.get(callId);
  if (!session) return;
  session.thinking?.stop();
  session.thinking = null;
  clearPlayback(callId);
}

export function startThinkingOnCall(callId: string): void {
  const session = sessions.get(callId);
  if (!session?.streamSid || session.twilioWs.readyState !== 1 || session.isSpeaking) return;

  stopThinkingOnCall(callId);
  session.thinking = streamThinkingMulaw(
    (chunk) => {
      if (!session.thinking || session.isSpeaking || session.twilioWs.readyState !== 1) return false;
      session.twilioWs.send(
        JSON.stringify({
          event: "media",
          streamSid: session.streamSid,
          media: { payload: chunk.toString("base64") },
        }),
      );
      return true;
    },
    () => !session.thinking || session.isSpeaking,
  );
}

export async function speakOnCall(
  callId: string,
  text: string,
  tts: TtsSession,
  options?: TtsOptions,
): Promise<number> {
  const session = sessions.get(callId);
  if (!session || !text.trim()) return 0;

  stopThinkingOnCall(callId);

  const { audio } = await synthesizeHebrewSpeech(text, options);
  if (!audio || tts.isAborted()) {
    logger.warn({ callId, hasAudio: Boolean(audio) }, "speakOnCall skipped — no TTS audio");
    return 0;
  }

  clearPlayback(callId);

  session.isSpeaking = true;
  const signal = tts.getSignal();
  logger.info({ callId, bytes: audio.length }, "Streaming TTS to caller");

  let playedBytes = 0;
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
      playedBytes = offset + chunk.length;

      try {
        await sleep(20, signal);
      } catch {
        break;
      }
    }
  } finally {
    session.isSpeaking = false;
  }

  if (playedBytes === 0) return 0;
  return Math.ceil((playedBytes * 1000) / 8000);
}

export function hasMediaSession(callId: string): boolean {
  return sessions.has(callId);
}

export function isStreamingTtsOnCall(callId: string): boolean {
  return sessions.get(callId)?.isSpeaking ?? false;
}

export async function waitForMediaSession(callId: string, maxMs = 10000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (sessions.has(callId)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

/** @deprecated Barge-in processes speech immediately; kept for callers after playback. */
export async function flushPendingCustomerSpeech(_callId: string): Promise<void> {}
