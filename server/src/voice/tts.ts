import { getAiConfig } from "../services/settingsService.js";
import { logger } from "../logger.js";
import { adaptHebrewTextForTts } from "../utils/hebrewTtsGender.js";
import type { CustomerSex } from "../utils/genderHebrew.js";

export type TtsOptions = {
  /** Addressee sex — adjusts pronunciation of homographs like לך (lecha/lach). */
  addresseeSex?: CustomerSex;
};

export type TtsSynthesisResult = {
  audio: Buffer | null;
  /** Hebrew message suitable for UI when `audio` is null. */
  errorMessage?: string;
};

function ttsUserMessageForApiFailure(status: number, body: string): string {
  try {
    const detail = JSON.parse(body)?.detail as
      | { code?: string; message?: string }
      | undefined;
    if (detail?.code === "quota_exceeded") {
      return "מכסת ElevenLabs אזלה — יש לעדכן מכסה בחשבון ElevenLabs או לקצר את טקסט הדיבור";
    }
    if (status === 401) {
      return "מפתח ElevenLabs לא תקין — בדקו בהגדרות";
    }
    if (detail?.message) {
      return `ElevenLabs: ${detail.message}`;
    }
  } catch {
    // ignore JSON parse errors
  }
  return "לא ניתן להפיק דיבור מ-ElevenLabs";
}

/** ElevenLabs Hebrew sales voice for YES caller */
export const ELEVENLABS_VOICE_ID = "YYTS9u0exInqiKLFra6w";

const CACHE_TTL_MS = 30 * 60 * 1000;
const audioCache = new Map<string, { buffer: Buffer; expiresAt: number }>();

export function ttsCacheKey(text: string, outputFormat: string, options?: TtsOptions): string {
  const ttsText = adaptHebrewTextForTts(text, options?.addresseeSex ?? "male");
  return `${outputFormat}|${ttsText}`;
}

function getCachedAudio(key: string): Buffer | null {
  const hit = audioCache.get(key);
  if (!hit || hit.expiresAt < Date.now()) {
    audioCache.delete(key);
    return null;
  }
  return hit.buffer;
}

function putCachedAudio(key: string, buffer: Buffer): void {
  audioCache.set(key, { buffer, expiresAt: Date.now() + CACHE_TTL_MS });
}

function elevenLabsModelId(): string {
  return process.env.ELEVENLABS_MODEL_ID ?? "eleven_v3";
}

const ELEVENLABS_FLASH_FALLBACK_MODEL = "eleven_flash_v2_5";

function isQuotaExceededBody(body: string): boolean {
  return body.includes("quota_exceeded");
}

async function requestElevenLabsAudio(
  apiKey: string,
  voiceId: string,
  outputFormat: string,
  ttsText: string,
  modelId: string,
): Promise<{ ok: true; audio: Buffer } | { ok: false; status: number; body: string; modelId: string }> {
  const body: Record<string, string> = { text: ttsText, model_id: modelId };
  if (modelId === "eleven_v3") {
    body.language_code = "he";
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${outputFormat}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (res.ok) {
    return { ok: true, audio: Buffer.from(await res.arrayBuffer()) };
  }
  return { ok: false, status: res.status, body: await res.text(), modelId };
}

async function synthesizeSpeech(
  text: string,
  outputFormat: string,
  options?: TtsOptions,
): Promise<TtsSynthesisResult> {
  const config = await getAiConfig();
  if (!config.elevenLabsApiKey) {
    logger.warn("ElevenLabs API key missing — no TTS audio");
    return {
      audio: null,
      errorMessage: "מפתח ElevenLabs חסר — הוסיפו בהגדרות או ב-ELEVENLABS_API_KEY",
    };
  }

  const ttsText = adaptHebrewTextForTts(text, options?.addresseeSex ?? "male");
  const cacheKey = ttsCacheKey(text, outputFormat, options);
  const cached = getCachedAudio(cacheKey);
  if (cached) {
    logger.info(
      { bytes: cached.length, voiceId: ELEVENLABS_VOICE_ID, outputFormat, cache: "hit" },
      "ElevenLabs TTS cache hit",
    );
    return { audio: cached };
  }

  const voiceId = ELEVENLABS_VOICE_ID;
  const primaryModelId = elevenLabsModelId();

  let result = await requestElevenLabsAudio(
    config.elevenLabsApiKey,
    voiceId,
    outputFormat,
    ttsText,
    primaryModelId,
  );

  if (
    !result.ok &&
    primaryModelId === "eleven_v3" &&
    isQuotaExceededBody(result.body)
  ) {
    logger.info(
      { primaryModelId, fallbackModelId: ELEVENLABS_FLASH_FALLBACK_MODEL },
      "ElevenLabs v3 quota hit — retrying with flash model",
    );
    result = await requestElevenLabsAudio(
      config.elevenLabsApiKey,
      voiceId,
      outputFormat,
      ttsText,
      ELEVENLABS_FLASH_FALLBACK_MODEL,
    );
  }

  if (!result.ok) {
    logger.warn(
      {
        status: result.status,
        body: result.body.slice(0, 200),
        modelId: result.modelId,
        voiceId,
      },
      "ElevenLabs TTS request failed",
    );
    return { audio: null, errorMessage: ttsUserMessageForApiFailure(result.status, result.body) };
  }

  const audio = result.audio;
  putCachedAudio(cacheKey, audio);
  logger.info(
    { bytes: audio.length, voiceId, modelId: primaryModelId, outputFormat, cache: "miss" },
    "ElevenLabs TTS synthesized",
  );
  return { audio };
}

export async function synthesizeHebrewSpeech(
  text: string,
  options?: TtsOptions,
): Promise<TtsSynthesisResult> {
  return synthesizeSpeech(text, "ulaw_8000", options);
}

export async function synthesizeHebrewSpeechMp3(
  text: string,
  options?: TtsOptions,
): Promise<TtsSynthesisResult> {
  return synthesizeSpeech(text, "mp3_44100_128", options);
}

export class TtsSession {
  private aborted = false;
  private abortController = new AbortController();

  abort(): void {
    this.aborted = true;
    this.abortController.abort();
  }

  isAborted(): boolean {
    return this.aborted;
  }

  getSignal(): AbortSignal {
    return this.abortController.signal;
  }
}

/** Pre-warm ElevenLabs TTS so the first real call does not pay cold-start latency. */
export async function warmElevenLabsTts(): Promise<void> {
  const { audio: buf } = await synthesizeHebrewSpeech(".");
  if (buf?.length) {
    logger.info({ bytes: buf.length }, "ElevenLabs TTS warm-up complete");
  }
}
