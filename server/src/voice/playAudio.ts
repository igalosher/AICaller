import { randomUUID } from "node:crypto";
import { THINKING_LOOP_MULAW } from "./thinkingSound.js";
import { synthesizeHebrewSpeechMp3, ttsCacheKey, type TtsOptions } from "./tts.js";

const THINKING_CLIP_ID = "thinking-tone-loop";

interface Clip {
  buffer: Buffer;
  contentType: string;
  expiresAt: number;
}

const clips = new Map<string, Clip>();
const clipIdByTextKey = new Map<string, string>();
const TTL_MS = 10 * 60 * 1000;
/** ElevenLabs `mp3_44100_128` output — constant 128 kbps. */
const MP3_BITRATE_BPS = 128_000;

export function estimateMp3DurationMs(buffer: Buffer): number {
  if (!buffer.length) return 0;
  const base = Math.ceil((buffer.length * 8 * 1000) / MP3_BITRATE_BPS);
  return Math.ceil(base * 1.15) + 500;
}

export function estimateMulawDurationMs(buffer: Buffer): number {
  if (!buffer.length) return 0;
  return Math.ceil((buffer.length * 1000) / 8000);
}

export type PlayClip = { id: string; durationMs: number };

export async function createPlayClip(text: string, options?: TtsOptions): Promise<PlayClip | null> {
  const textKey = ttsCacheKey(text, "mp3_44100_128", options);
  const existingId = clipIdByTextKey.get(textKey);
  if (existingId) {
    const clip = clips.get(existingId);
    if (clip && clip.expiresAt > Date.now()) {
      return { id: existingId, durationMs: estimateMp3DurationMs(clip.buffer) };
    }
    clipIdByTextKey.delete(textKey);
  }

  const buffer = await synthesizeHebrewSpeechMp3(text, options);
  if (!buffer?.length) return null;

  const id = randomUUID();
  clips.set(id, {
    buffer,
    contentType: "audio/mpeg",
    expiresAt: Date.now() + TTL_MS,
  });
  clipIdByTextKey.set(textKey, id);
  return { id, durationMs: estimateMp3DurationMs(buffer) };
}

export function getPlayClipDurationMs(id: string): number {
  const clip = clips.get(id);
  if (!clip || clip.expiresAt < Date.now()) return 0;
  return estimateMp3DurationMs(clip.buffer);
}

export function getPlayClip(id: string): { buffer: Buffer; contentType: string } | null {
  const clip = clips.get(id);
  if (!clip || clip.expiresAt < Date.now()) {
    clips.delete(id);
    return null;
  }
  return { buffer: clip.buffer, contentType: clip.contentType };
}

function wrapMulawAsWav(mulaw: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + mulaw.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(7, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8000, 24);
  header.writeUInt32LE(8000, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write("data", 36);
  header.writeUInt32LE(mulaw.length, 40);
  return Buffer.concat([header, mulaw]);
}

/** 8 kHz WAV thinking loop for Twilio Play loop during LLM processing. */
export function ensureThinkingClip(): string {
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  clips.set(THINKING_CLIP_ID, {
    buffer: wrapMulawAsWav(THINKING_LOOP_MULAW),
    contentType: "audio/wav",
    expiresAt,
  });
  return THINKING_CLIP_ID;
}
