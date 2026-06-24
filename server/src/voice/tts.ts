import { getAiConfig } from "../services/settingsService.js";
import { logger } from "../logger.js";
import { adaptHebrewTextForTts } from "../utils/hebrewTtsGender.js";
import type { CustomerSex } from "../utils/genderHebrew.js";

export type TtsOptions = {
  /** Addressee sex — adjusts pronunciation of homographs like לך (lecha/lach). */
  addresseeSex?: CustomerSex;
};

/** ElevenLabs Hebrew sales voice for YES caller */
export const ELEVENLABS_VOICE_ID = "YYTS9u0exInqiKLFra6w";

function elevenLabsModelId(): string {
  return process.env.ELEVENLABS_MODEL_ID ?? "eleven_v3";
}

async function synthesizeSpeech(
  text: string,
  outputFormat: string,
  options?: TtsOptions,
): Promise<Buffer | null> {
  const config = await getAiConfig();
  if (!config.elevenLabsApiKey) {
    logger.warn("ElevenLabs API key missing — no TTS audio");
    return null;
  }

  const ttsText = adaptHebrewTextForTts(text, options?.addresseeSex ?? "male");

  const voiceId = ELEVENLABS_VOICE_ID;
  const modelId = elevenLabsModelId();
  const body: Record<string, string> = { text: ttsText, model_id: modelId };
  if (modelId === "eleven_v3") {
    body.language_code = "he";
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${outputFormat}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": config.elevenLabsApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const errBody = await res.text();
    logger.warn(
      { status: res.status, body: errBody.slice(0, 200), modelId, voiceId },
      "ElevenLabs TTS request failed",
    );
    return null;
  }
  const audio = Buffer.from(await res.arrayBuffer());
  logger.info({ bytes: audio.length, voiceId, modelId, outputFormat }, "ElevenLabs TTS synthesized");
  return audio;
}

export async function synthesizeHebrewSpeech(
  text: string,
  options?: TtsOptions,
): Promise<Buffer | null> {
  return synthesizeSpeech(text, "ulaw_8000", options);
}

export async function synthesizeHebrewSpeechMp3(
  text: string,
  options?: TtsOptions,
): Promise<Buffer | null> {
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
