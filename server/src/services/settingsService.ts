import { decrypt, encrypt } from "../utils/encryption.js";
import { prisma } from "../db.js";
import { TwilioProvider } from "../telephony/twilioProvider.js";
import { MockTelephonyProvider } from "../telephony/mockProvider.js";
import type { TelephonyProvider } from "../telephony/provider.js";

export interface TelephonyConfig {
  provider: "twilio" | "mock";
  accountSid?: string;
  authToken?: string;
  phoneNumber?: string;
  webhookBaseUrl?: string;
}

export interface AiConfig {
  openaiApiKey?: string;
  deepgramApiKey?: string;
  elevenLabsApiKey?: string;
}

export async function getSettings() {
  let settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  if (!settings) {
    settings = await prisma.appSettings.create({ data: { id: "default" } });
  }
  return settings;
}

export async function getTelephonyConfig(): Promise<TelephonyConfig> {
  const fromEnv: TelephonyConfig = {
    provider: (process.env.TELEPHONY_PROVIDER as "mock" | "twilio") ?? "mock",
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    webhookBaseUrl: process.env.TWILIO_WEBHOOK_BASE_URL,
  };
  const settings = await getSettings();
  if (!settings.telephonyConfig) {
    return fromEnv;
  }
  const stored = JSON.parse(decrypt(settings.telephonyConfig)) as TelephonyConfig;
  return {
    provider: stored.provider ?? fromEnv.provider,
    accountSid: stored.accountSid || fromEnv.accountSid,
    authToken: stored.authToken || fromEnv.authToken,
    phoneNumber: stored.phoneNumber || fromEnv.phoneNumber,
    webhookBaseUrl: stored.webhookBaseUrl || fromEnv.webhookBaseUrl,
  };
}

export async function saveTelephonyConfig(config: TelephonyConfig) {
  await prisma.appSettings.upsert({
    where: { id: "default" },
    create: { id: "default", telephonyConfig: encrypt(JSON.stringify(config)) },
    update: { telephonyConfig: encrypt(JSON.stringify(config)) },
  });
}

export async function getAiConfig(): Promise<AiConfig> {
  const fromEnv: AiConfig = {
    openaiApiKey: process.env.OPENAI_API_KEY,
    deepgramApiKey: process.env.DEEPGRAM_API_KEY,
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
  };
  const settings = await getSettings();
  if (!settings.aiConfig) return fromEnv;

  const stored = JSON.parse(decrypt(settings.aiConfig)) as AiConfig;
  return {
    openaiApiKey: stored.openaiApiKey || fromEnv.openaiApiKey,
    deepgramApiKey: stored.deepgramApiKey || fromEnv.deepgramApiKey,
    elevenLabsApiKey: stored.elevenLabsApiKey || fromEnv.elevenLabsApiKey,
  };
}

export async function saveAiConfig(config: AiConfig) {
  const existing = await getAiConfig();
  const merged: AiConfig = {
    openaiApiKey: config.openaiApiKey?.trim() || existing.openaiApiKey,
    deepgramApiKey: config.deepgramApiKey?.trim() || existing.deepgramApiKey,
    elevenLabsApiKey: config.elevenLabsApiKey?.trim() || existing.elevenLabsApiKey,
  };
  await prisma.appSettings.upsert({
    where: { id: "default" },
    create: { id: "default", aiConfig: encrypt(JSON.stringify(merged)) },
    update: { aiConfig: encrypt(JSON.stringify(merged)) },
  });
}

export async function getTelephonyProvider(): Promise<TelephonyProvider> {
  const config = await getTelephonyConfig();
  if (config.provider === "twilio" && config.accountSid && config.authToken && config.phoneNumber) {
    return new TwilioProvider(
      config.accountSid,
      config.authToken,
      config.phoneNumber,
      config.webhookBaseUrl ?? process.env.TWILIO_WEBHOOK_BASE_URL ?? "http://localhost:3001",
    );
  }
  return new MockTelephonyProvider();
}
