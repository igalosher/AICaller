import { getAiConfig } from "../services/settingsService.js";
import { logger } from "../logger.js";

export async function transcribeHebrewAudio(audioChunk: Buffer): Promise<string | null> {
  const config = await getAiConfig();
  if (!config.deepgramApiKey) {
    return null;
  }
  // One-shot fallback — live calls use DeepgramSttSession in mediaSession.ts
  const res = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-3&language=multi&encoding=mulaw&sample_rate=8000",
    {
      method: "POST",
      headers: {
        Authorization: `Token ${config.deepgramApiKey}`,
        "Content-Type": "audio/mulaw",
      },
      body: new Uint8Array(audioChunk),
    },
  );
  if (!res.ok) {
    logger.warn({ status: res.status }, "Deepgram prerecorded transcription failed");
    return null;
  }
  const data = (await res.json()) as {
    results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
  };
  return data.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? null;
}

/** Twilio Media Streams send 8 kHz μ-law (not PCM). */
export function detectVoiceActivityMuLaw(audioChunk: Buffer, activeRatio = 0.08): boolean {
  if (audioChunk.length === 0) return false;
  let active = 0;
  for (const byte of audioChunk) {
    if (Math.abs(byte - 0xff) > 10) active++;
  }
  return active / audioChunk.length > activeRatio;
}

/** @deprecated Use detectVoiceActivityMuLaw for Twilio μ-law audio. */
export function detectVoiceActivity(audioChunk: Buffer, threshold = 500): boolean {
  if (audioChunk.length < 2) return false;
  if (audioChunk.length <= 320) {
    return detectVoiceActivityMuLaw(audioChunk);
  }
  let sum = 0;
  for (let i = 0; i < audioChunk.length; i += 2) {
    const sample = audioChunk.readInt16LE(i);
    sum += Math.abs(sample);
  }
  const avg = sum / (audioChunk.length / 2);
  return avg > threshold;
}
