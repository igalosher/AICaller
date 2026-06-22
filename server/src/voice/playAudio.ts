import { randomUUID } from "node:crypto";
import { synthesizeHebrewSpeechMp3 } from "./tts.js";

interface Clip {
  buffer: Buffer;
  contentType: string;
  expiresAt: number;
}

const clips = new Map<string, Clip>();
const TTL_MS = 10 * 60 * 1000;

export async function createPlayClip(text: string): Promise<string | null> {
  const buffer = await synthesizeHebrewSpeechMp3(text);
  if (!buffer?.length) return null;

  const id = randomUUID();
  clips.set(id, {
    buffer,
    contentType: "audio/mpeg",
    expiresAt: Date.now() + TTL_MS,
  });
  return id;
}

export function getPlayClip(id: string): { buffer: Buffer; contentType: string } | null {
  const clip = clips.get(id);
  if (!clip || clip.expiresAt < Date.now()) {
    clips.delete(id);
    return null;
  }
  return { buffer: clip.buffer, contentType: clip.contentType };
}
