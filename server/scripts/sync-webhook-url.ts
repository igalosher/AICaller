import "dotenv/config";
import { getTelephonyConfig, saveTelephonyConfig } from "../src/services/settingsService.js";

const target = process.env.TWILIO_WEBHOOK_BASE_URL;
if (!target) {
  console.error("TWILIO_WEBHOOK_BASE_URL is not set");
  process.exit(1);
}

const config = await getTelephonyConfig();
if (config.webhookBaseUrl === target) {
  console.log("Webhook URL already in sync");
  process.exit(0);
}

await saveTelephonyConfig({ ...config, webhookBaseUrl: target });
console.log("Synced stored telephony webhook URL from .env");
