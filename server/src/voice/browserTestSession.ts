import type { CallOutcome } from "@prisma/client";
import type WebSocket from "ws";
import { prisma } from "../db.js";
import { logger } from "../logger.js";
import { synthesizeHebrewSpeechMp3, type TtsOptions } from "./tts.js";

type SpeechHandler = (callId: string, text: string) => Promise<void>;
type SessionStartHandler = (callId: string) => Promise<void>;
type SessionEndHandler = (callId: string) => Promise<void>;
type PlaybackIdleHandler = (callId: string) => void;
type PendingCallEndHandler = (callId: string, outcome: CallOutcome) => Promise<void>;

let onCustomerSpeech: SpeechHandler = async () => {};
let onSessionStart: SessionStartHandler = async () => {};
let onSessionEnd: SessionEndHandler = async () => {};
let onPlaybackIdle: PlaybackIdleHandler = () => {};
let onPendingCallEnd: PendingCallEndHandler = async () => {};

export function registerBrowserTestHandlers(handlers: {
  onCustomerSpeech: SpeechHandler;
  onSessionStart: SessionStartHandler;
  onSessionEnd?: SessionEndHandler;
  onPlaybackIdle?: PlaybackIdleHandler;
  onPendingCallEnd?: PendingCallEndHandler;
}): void {
  onCustomerSpeech = handlers.onCustomerSpeech;
  onSessionStart = handlers.onSessionStart;
  onSessionEnd = handlers.onSessionEnd ?? (async () => {});
  onPlaybackIdle = handlers.onPlaybackIdle ?? (() => {});
  onPendingCallEnd = handlers.onPendingCallEnd ?? (async () => {});
}

interface BrowserTestSession {
  callId: string;
  ws: WebSocket;
  processingSpeech: boolean;
  lastFinalTranscript: string;
  lastFinalAt: number;
  /** True after `play` sent until skip, stop, or customer speech interrupt. */
  speaking: boolean;
  /** Finalize call + hangup after current clip finishes playing. */
  pendingCallEnd?: CallOutcome;
}

const sessions = new Map<string, BrowserTestSession>();

async function handleCustomerText(callId: string, text: string) {
  const session = sessions.get(callId);
  if (!session) return;

  const now = Date.now();
  if (text === session.lastFinalTranscript && now - session.lastFinalAt < 3000) return;
  if (session.processingSpeech) return;

  session.lastFinalTranscript = text;
  session.lastFinalAt = now;
  session.processingSpeech = true;

  logger.info({ callId, text }, "Browser test typed reply");

  try {
    await onCustomerSpeech(callId, text);
  } finally {
    session.processingSpeech = false;
  }
}

async function validateTestCall(callId: string): Promise<boolean> {
  const call = await prisma.call.findUnique({ where: { id: callId } });
  return Boolean(call?.externalCallId?.startsWith("test-") && call.status === "connected");
}

export async function handleBrowserTestConnection(ws: WebSocket, callId: string): Promise<void> {
  const earlyMessages: Buffer[] = [];
  let sessionReady = false;

  ws.on("close", () => {
    const current = sessions.get(callId);
    if (current?.ws === ws) {
      unregisterBrowserSession(callId);
    }
  });

  ws.on("message", (data) => {
    if (!sessionReady) {
      earlyMessages.push(data as Buffer);
      return;
    }
    void dispatchBrowserTestMessage(callId, data);
  });

  if (!(await validateTestCall(callId))) {
    ws.send(JSON.stringify({ type: "error", message: "שיחת טסט לא נמצאה או שאינה פעילה" }));
    ws.close();
    return;
  }

  sessions.set(callId, {
    callId,
    ws,
    processingSpeech: false,
    lastFinalTranscript: "",
    lastFinalAt: 0,
    speaking: false,
  });
  sessionReady = true;

  for (const data of earlyMessages) {
    await dispatchBrowserTestMessage(callId, data);
  }
}

async function dispatchBrowserTestMessage(callId: string, data: WebSocket.RawData): Promise<void> {
  try {
    await handleBrowserTestMessage(callId, JSON.parse(data.toString()) as BrowserClientMessage);
  } catch {
    // ignore malformed frames
  }
}

type BrowserClientMessage =
  | { type: "start" }
  | { type: "text"; text: string }
  | { type: "skip_speak" }
  | { type: "playback_done" };

async function handleBrowserTestMessage(callId: string, message: BrowserClientMessage): Promise<void> {
  const session = sessions.get(callId);
  if (!session) return;

  if (message.type === "start") {
    session.ws.send(JSON.stringify({ type: "ready" }));
    void onSessionStart(callId).catch((err) => {
      logger.error({ err, callId }, "Browser test session start failed");
      const live = sessions.get(callId);
      if (live?.ws === session.ws && live.ws.readyState === 1) {
        live.ws.send(JSON.stringify({ type: "error", message: "שגיאה בהפעלת שיחת הטסט" }));
      }
    });
    return;
  }

  if (message.type === "skip_speak") {
    if (!session.speaking) return;
    session.speaking = false;
    session.ws.send(JSON.stringify({ type: "stop_playback" }));
    session.ws.send(JSON.stringify({ type: "speak_skipped" }));
    await completePendingCallEnd(callId);
    onPlaybackIdle(callId);
    return;
  }

  if (message.type === "playback_done") {
    session.speaking = false;
    await completePendingCallEnd(callId);
    onPlaybackIdle(callId);
    return;
  }

  if (message.type === "text" && message.text.trim()) {
    await handleCustomerText(callId, message.text.trim());
  }
}

export function setBrowserPendingCallEnd(callId: string, outcome: CallOutcome): void {
  const session = sessions.get(callId);
  if (!session) return;
  session.pendingCallEnd = outcome;
}

export async function completePendingCallEnd(callId: string): Promise<void> {
  const session = sessions.get(callId);
  if (!session?.pendingCallEnd) return;
  const outcome = session.pendingCallEnd;
  session.pendingCallEnd = undefined;
  try {
    await onPendingCallEnd(callId, outcome);
  } catch (err) {
    logger.error({ err, callId }, "pending test call end failed");
  }
  if (session.ws.readyState === 1) {
    session.ws.send(JSON.stringify({ type: "hangup" }));
  }
}

export async function speakToBrowser(
  callId: string,
  text: string,
  endCall: boolean,
  options?: TtsOptions,
): Promise<boolean> {
  const session = sessions.get(callId);
  if (!session || session.ws.readyState !== 1) return false;
  if (!text.trim()) {
    if (endCall && session.pendingCallEnd) {
      await completePendingCallEnd(callId);
    }
    return false;
  }

  const audio = await synthesizeHebrewSpeechMp3(text, options);
  if (!audio?.length) {
    logger.warn({ callId }, "Browser test TTS skipped — no audio");
    if (endCall && session.pendingCallEnd) {
      await completePendingCallEnd(callId);
    }
    return false;
  }

  session.speaking = true;
  session.ws.send(
    JSON.stringify({
      type: "play",
      mime: "audio/mpeg",
      audio: audio.toString("base64"),
    }),
  );

  return true;
}

export function stopBrowserPlayback(callId: string): void {
  const session = sessions.get(callId);
  if (!session || session.ws.readyState !== 1) return;
  session.speaking = false;
  session.ws.send(JSON.stringify({ type: "stop_playback" }));
}

export function hasBrowserSession(callId: string): boolean {
  return sessions.has(callId);
}

export function disconnectBrowserTestCall(callId: string): void {
  const session = sessions.get(callId);
  if (!session) return;
  if (session.ws.readyState === 1) {
    session.ws.send(JSON.stringify({ type: "hangup" }));
  }
  sessions.delete(callId);
  logger.info({ callId }, "Browser test session disconnected");
}

export function unregisterBrowserSession(callId: string): void {
  const session = sessions.get(callId);
  if (!session) return;
  sessions.delete(callId);
  logger.info({ callId }, "Browser test session ended");
  void onSessionEnd(callId);
}
