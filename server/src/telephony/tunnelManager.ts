import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../logger.js";
import { AppError } from "../middleware/errorHandler.js";
import { getTelephonyConfig, saveTelephonyConfig } from "../services/settingsService.js";

const TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
const PROBE_PATH = "/health";
const TUNNEL_START_TIMEOUT_MS = 120_000;

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
  const root = baseUrl.replace(/\/$/, "");
  try {
    const health = await fetch(`${root}${PROBE_PATH}`, {
      method: "GET",
      signal: AbortSignal.timeout(8_000),
    });
    if (!health.ok) return false;
  } catch {
    return false;
  }
  try {
    const voice = await fetch(`${root}/api/webhooks/twilio/voice?callId=healthcheck`, {
      method: "POST",
      signal: AbortSignal.timeout(8_000),
    });
    return voice.ok;
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

function isDevTwilioTunnelMode(): boolean {
  return process.env.DEV_TWILIO_TUNNEL === "1";
}

async function probeLocalServer(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function syncWebhookToDb(url: string): Promise<void> {
  const config = await getTelephonyConfig();
  if (config.webhookBaseUrl === url) return;
  await saveTelephonyConfig({
    ...config,
    provider: config.provider ?? "twilio",
    webhookBaseUrl: url,
  });
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

const CLOUDFLARED_CANDIDATES = [
  "cloudflared",
  "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
  "C:\\Program Files\\cloudflared\\cloudflared.exe",
];

function resolveCloudflaredCommand(): { command: string; args: string[] } {
  const tunnelArgs = ["tunnel", "--protocol", "http2", "--url"];
  for (const candidate of CLOUDFLARED_CANDIDATES) {
    if (candidate === "cloudflared") continue;
    if (existsSync(candidate)) return { command: candidate, args: tunnelArgs };
  }
  return {
    command: "npx",
    args: ["--yes", "cloudflared", "tunnel", "--protocol", "http2", "--url"],
  };
}

function spawnCloudflared(localPort: number): ChildProcess {
  const { command, args } = resolveCloudflaredCommand();
  const localUrl = `http://127.0.0.1:${localPort}`;
  return spawn(command, [...args, localUrl], {
    shell: command === "npx",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function startCloudflaredTunnel(localPort: number): Promise<string> {
  if (startingPromise) return startingPromise;

  startingPromise = new Promise<string>((resolve, reject) => {
    stopTunnelProcess();
    currentPublicUrl = null;

    const port = localPort;
    logger.info({ port }, "Starting cloudflared tunnel for Twilio webhooks");

    const child = spawnCloudflared(port);
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
  const envUrl = process.env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/$/, "") ?? "";
  let url = config.webhookBaseUrl ?? envUrl ?? "";

  if (envUrl && (await probeWebhookBaseUrl(envUrl))) {
    if (config.webhookBaseUrl !== envUrl) {
      await syncWebhookToDb(envUrl);
    }
    currentPublicUrl = envUrl;
    return;
  }

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

  if (isDevTwilioTunnelMode() && (await probeLocalServer(port))) {
    throw new AppError(
      503,
      "המנהרה ל-Twilio לא פעילה. הפעל מחדש את npm run dev:twilio (השאר את הטרמינל פתוח).",
    );
  }

  try {
    url = await startCloudflaredTunnel(port);
    if (!(await probeWebhookBaseUrl(url))) {
      throw new Error("Webhook probe failed after tunnel start");
    }
  } catch (err) {
    logger.error({ err }, "Failed to start Twilio webhook tunnel");
    if (await probeLocalServer(port)) {
      throw new AppError(
        503,
        "המנהרה ל-Twilio לא פעילה. הפעל מחדש את npm run dev:twilio (השאר את הטרמינל פתוח).",
      );
    }
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

  if (isDevTwilioTunnelMode()) {
    logger.warn(
      { url },
      "Twilio webhook tunnel is down — restart npm run dev:twilio to get a fresh cloudflared URL",
    );
    return;
  }

  if (shouldAutoStartTunnel(url)) {
    logger.warn(
      { url },
      "Twilio webhook URL not reachable — a tunnel will start automatically when you place the next call",
    );
  } else {
    logger.warn({ url }, "Twilio webhook URL unreachable — voice calls will fail until it is fixed");
  }
}
