import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../logger.js";
import { AppError } from "../middleware/errorHandler.js";
import { getTelephonyConfig, saveTelephonyConfig } from "../services/settingsService.js";

const TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
const PROBE_PATH = "/api/webhooks/twilio/voice?callId=healthcheck";
const TUNNEL_START_TIMEOUT_MS = 90_000;

let tunnelProcess: ChildProcess | null = null;
let currentPublicUrl: string | null = null;
let startingPromise: Promise<string> | null = null;

function envPath(): string {
  return join(process.cwd(), ".env");
}

function patchEnvWebhook(url: string): void {
  const path = envPath();
  try {
    let content = readFileSync(path, "utf8");
    const line = `TWILIO_WEBHOOK_BASE_URL=${url}`;
    if (/^TWILIO_WEBHOOK_BASE_URL=.*/m.test(content)) {
      content = content.replace(/^TWILIO_WEBHOOK_BASE_URL=.*/m, line);
    } else {
      content = `${content.trimEnd()}\n${line}\n`;
    }
    writeFileSync(path, content);
  } catch (err) {
    logger.warn({ err }, "Could not write TWILIO_WEBHOOK_BASE_URL to .env");
  }
  process.env.TWILIO_WEBHOOK_BASE_URL = url;
}

export async function probeWebhookBaseUrl(baseUrl: string): Promise<boolean> {
  if (!baseUrl || baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1")) {
    return false;
  }
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}${PROBE_PATH}`, {
      method: "POST",
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function shouldAutoStartTunnel(url: string | undefined): boolean {
  if (!url) return true;
  if (url.includes("localhost") || url.includes("127.0.0.1")) return true;
  if (url.includes("trycloudflare.com")) return true;
  return false;
}

async function syncWebhookToDb(url: string): Promise<void> {
  const config = await getTelephonyConfig();
  if (config.webhookBaseUrl === url) return;
  await saveTelephonyConfig({ ...config, webhookBaseUrl: url });
  logger.info({ url }, "Synced Twilio webhook URL to settings");
}

function stopTunnelProcess(): void {
  if (!tunnelProcess) return;
  try {
    tunnelProcess.kill("SIGTERM");
  } catch {
    // ignore
  }
  tunnelProcess = null;
}

function startCloudflaredTunnel(localPort: number): Promise<string> {
  if (startingPromise) return startingPromise;

  startingPromise = new Promise<string>((resolve, reject) => {
    stopTunnelProcess();
    currentPublicUrl = null;

    const port = localPort;
    logger.info({ port }, "Starting cloudflared tunnel for Twilio webhooks");

    const child = spawn(
      "npx",
      ["--yes", "cloudflared", "tunnel", "--protocol", "http2", "--url", `http://127.0.0.1:${port}`],
      { shell: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    tunnelProcess = child;

    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      stopTunnelProcess();
      startingPromise = null;
      reject(new Error("cloudflared timed out waiting for public URL"));
    }, TUNNEL_START_TIMEOUT_MS);

    const onOutput = (chunk: Buffer) => {
      const text = chunk.toString();
      if (currentPublicUrl || !TUNNEL_URL_RE.test(text)) return;

      const url = text.match(TUNNEL_URL_RE)?.[0];
      if (!url) return;

      void (async () => {
        patchEnvWebhook(url);
        await syncWebhookToDb(url);
        currentPublicUrl = url;

        // Wait until our API answers through the tunnel (server must already be listening).
        for (let i = 0; i < 30; i++) {
          if (await probeWebhookBaseUrl(url)) {
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              startingPromise = null;
              logger.info({ url }, "Twilio webhook tunnel ready");
              resolve(url);
            }
            return;
          }
          await new Promise((r) => setTimeout(r, 1_000));
        }

        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          startingPromise = null;
          reject(new Error("Tunnel URL assigned but webhook probe failed"));
        }
      })();
    };

    child.stdout?.on("data", onOutput);
    child.stderr?.on("data", onOutput);

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      startingPromise = null;
      stopTunnelProcess();
      reject(err);
    });

    child.on("exit", (code) => {
      if (!settled && code !== 0) {
        settled = true;
        clearTimeout(timeout);
        startingPromise = null;
        reject(new Error(`cloudflared exited with code ${code ?? "unknown"}`));
        return;
      }
      if (tunnelProcess === child) {
        tunnelProcess = null;
        currentPublicUrl = null;
        logger.warn("cloudflared tunnel process exited — will restart on next call if needed");
      }
    });
  });

  return startingPromise;
}

/**
 * Ensures Twilio can reach our voice webhook before placing a call.
 * For local dev, starts cloudflared automatically when the configured URL is dead.
 */
export async function ensureTwilioWebhookReady(): Promise<void> {
  const config = await getTelephonyConfig();
  if (config.provider !== "twilio") return;

  const port = Number(process.env.PORT ?? 3001);
  let url = config.webhookBaseUrl ?? process.env.TWILIO_WEBHOOK_BASE_URL ?? "";

  if (currentPublicUrl && (await probeWebhookBaseUrl(currentPublicUrl))) {
    if (url !== currentPublicUrl) {
      patchEnvWebhook(currentPublicUrl);
      await syncWebhookToDb(currentPublicUrl);
    }
    return;
  }

  if (url && (await probeWebhookBaseUrl(url))) {
    await syncWebhookToDb(url);
    currentPublicUrl = url;
    return;
  }

  if (!shouldAutoStartTunnel(url)) {
    throw new AppError(
      503,
      "כתובת ה-webhook של Twilio לא נגישה. עדכן את כתובת השרת בהגדרות טלפוניה.",
    );
  }

  try {
    url = await startCloudflaredTunnel(port);
    if (!(await probeWebhookBaseUrl(url))) {
      throw new Error("Webhook probe failed after tunnel start");
    }
  } catch (err) {
    logger.error({ err }, "Failed to start Twilio webhook tunnel");
    throw new AppError(
      503,
      "לא ניתן להפעיל מנהרה ל-Twilio. ודא שהשרת רץ וש-cloudflared זמין (npm install -g cloudflared או npx).",
    );
  }
}

export async function warnIfWebhookUnreachable(): Promise<void> {
  const config = await getTelephonyConfig();
  if (config.provider !== "twilio") return;

  const url = config.webhookBaseUrl ?? process.env.TWILIO_WEBHOOK_BASE_URL;
  if (!url) {
    logger.warn("TWILIO_WEBHOOK_BASE_URL is not set — a tunnel will start automatically on the next call");
    return;
  }

  if (await probeWebhookBaseUrl(url)) return;

  if (shouldAutoStartTunnel(url)) {
    logger.warn(
      { url },
      "Twilio webhook URL not reachable — a tunnel will start automatically when you place the next call",
    );
  } else {
    logger.warn({ url }, "Twilio webhook URL unreachable — voice calls will fail until it is fixed");
  }
}
