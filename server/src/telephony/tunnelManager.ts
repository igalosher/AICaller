import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../logger.js";
import { AppError } from "../middleware/errorHandler.js";
import { broadcastCallEvent } from "../websocket/callEvents.js";
import { getTelephonyConfig, saveTelephonyConfig } from "../services/settingsService.js";

const TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
const PROBE_PATH = "/health";
const TUNNEL_START_TIMEOUT_MS = 120_000;
const WATCHDOG_INTERVAL_MS = 90_000;

let tunnelProcess: ChildProcess | null = null;
let currentPublicUrl: string | null = null;
let startingPromise: Promise<string> | null = null;
let repairingPromise: Promise<boolean> | null = null;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let lastTunnelReachable: boolean | null = null;

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

/** Re-read .env without restarting Node (dev-with-tunnel may have written a new URL). */
function refreshEnvWebhookFromDisk(): string | null {
  try {
    const content = readFileSync(envPath(), "utf8");
    const match = content.match(/^TWILIO_WEBHOOK_BASE_URL=(.+)$/m);
    if (!match) return null;
    const url = match[1].trim().replace(/\/$/, "");
    process.env.TWILIO_WEBHOOK_BASE_URL = url;
    return url;
  } catch {
    return null;
  }
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

function isDevTunnelManagedByScript(): boolean {
  return process.env.DEV_TWILIO_TUNNEL === "1";
}

async function waitForDevTunnelUrlFromDisk(maxAttempts = 30): Promise<string | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const diskUrl = refreshEnvWebhookFromDisk();
    if (diskUrl && (await probeWebhookBaseUrl(diskUrl))) {
      currentPublicUrl = diskUrl;
      await syncWebhookToDb(diskUrl);
      broadcastTunnelStatus(true, diskUrl);
      return diskUrl;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return null;
}

function shouldAutoStartTunnel(url: string | undefined): boolean {
  if (isDevTunnelManagedByScript()) return false;
  if (!url) return true;
  if (url.includes("localhost") || url.includes("127.0.0.1")) return true;
  if (url.includes("trycloudflare.com")) return true;
  return false;
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

/** Kill stale cloudflared left by a dead dev tunnel before we spawn a fresh one. */
function killExternalCloudflaredProcesses(): void {
  if (process.platform === "win32") {
    spawn("taskkill", ["/F", "/IM", "cloudflared.exe"], { shell: true, stdio: "ignore" }).unref();
  } else {
    spawn("pkill", ["-f", "cloudflared tunnel"], { shell: true, stdio: "ignore" }).unref();
  }
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

function scheduleTunnelRepair(reason: string): void {
  setTimeout(() => {
    void repairTwilioWebhookTunnel().then((ok) => {
      if (ok) {
        logger.info({ reason }, "Twilio webhook tunnel auto-repaired");
      } else {
        logger.warn({ reason }, "Twilio webhook tunnel auto-repair failed");
      }
    });
  }, 3_000).unref();
}

function broadcastTunnelStatus(reachable: boolean, url?: string): void {
  if (lastTunnelReachable === reachable) return;
  lastTunnelReachable = reachable;
  broadcastCallEvent({
    type: "tunnel_status",
    reachable,
    webhookBaseUrl: url ?? currentPublicUrl ?? process.env.TWILIO_WEBHOOK_BASE_URL,
  });
}

function startCloudflaredTunnel(localPort: number): Promise<string> {
  if (isDevTunnelManagedByScript()) {
    return waitForDevTunnelUrlFromDisk().then((url) => {
      if (url) return url;
      throw new Error("dev tunnel script has not published a reachable webhook URL yet");
    });
  }

  if (startingPromise) return startingPromise;

  startingPromise = new Promise<string>((resolve, reject) => {
    stopTunnelProcess();
    killExternalCloudflaredProcesses();
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
        if (!process.env.DEV_TWILIO_TUNNEL) {
          process.env.DEV_TWILIO_TUNNEL = "1";
        }
        await syncWebhookToDb(url);
        currentPublicUrl = url;

        for (let i = 0; i < 45; i++) {
          if (await probeWebhookBaseUrl(url)) {
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              startingPromise = null;
              broadcastTunnelStatus(true, url);
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
        broadcastTunnelStatus(false);
        logger.warn({ code }, "cloudflared tunnel exited — scheduling auto-repair");
        scheduleTunnelRepair("cloudflared-exit");
      }
    });
  });

  return startingPromise;
}

async function tryAdoptWorkingUrl(urls: string[]): Promise<string | null> {
  const seen = new Set<string>();
  for (const raw of urls) {
    const url = raw?.replace(/\/$/, "");
    if (!url || seen.has(url)) continue;
    seen.add(url);
    if (await probeWebhookBaseUrl(url)) {
      currentPublicUrl = url;
      process.env.TWILIO_WEBHOOK_BASE_URL = url;
      await syncWebhookToDb(url);
      broadcastTunnelStatus(true, url);
      return url;
    }
  }
  return null;
}

/**
 * Detect a dead Twilio webhook tunnel and repair it (reload .env, probe, or spawn cloudflared).
 * Returns true when a working public webhook URL is available.
 */
export async function repairTwilioWebhookTunnel(): Promise<boolean> {
  if (repairingPromise) return repairingPromise;

  repairingPromise = (async () => {
    const config = await getTelephonyConfig();
    if (config.provider !== "twilio") return true;

    const port = Number(process.env.PORT ?? 3001);
    if (!(await probeLocalServer(port))) {
      logger.warn("Twilio tunnel repair skipped — local server not listening");
      return false;
    }

    const diskUrl = refreshEnvWebhookFromDisk();
    const envUrl = process.env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/$/, "") ?? "";
    const adopted = await tryAdoptWorkingUrl([
      diskUrl ?? "",
      envUrl,
      currentPublicUrl ?? "",
      config.webhookBaseUrl ?? "",
    ]);
    if (adopted) return true;

    if (isDevTunnelManagedByScript()) {
      logger.info("Dev tunnel down — waiting for dev:twilio to publish a new URL");
      const url = await waitForDevTunnelUrlFromDisk();
      if (url) return true;
      broadcastTunnelStatus(false, envUrl || diskUrl || config.webhookBaseUrl);
      return false;
    }

    const fallbackUrl = config.webhookBaseUrl ?? envUrl ?? diskUrl ?? "";
    if (!shouldAutoStartTunnel(fallbackUrl)) {
      broadcastTunnelStatus(false, fallbackUrl);
      return false;
    }

    try {
      const url = await startCloudflaredTunnel(port);
      const ok = await probeWebhookBaseUrl(url);
      broadcastTunnelStatus(ok, url);
      return ok;
    } catch (err) {
      logger.error({ err }, "Failed to auto-repair Twilio webhook tunnel");
      broadcastTunnelStatus(false);
      return false;
    }
  })().finally(() => {
    repairingPromise = null;
  });

  return repairingPromise;
}

/**
 * Ensures Twilio can reach our voice webhook before placing a call.
 */
export async function ensureTwilioWebhookReady(): Promise<void> {
  const config = await getTelephonyConfig();
  if (config.provider !== "twilio") return;

  const ok = await repairTwilioWebhookTunnel();
  if (ok) return;

  const port = Number(process.env.PORT ?? 3001);
  if (await probeLocalServer(port)) {
    throw new AppError(
      503,
      "לא ניתן להפעיל מנהרה ל-Twilio. ודא ש-cloudflared זמין (npm install -g cloudflared או npx) ונסה שוב.",
    );
  }
  throw new AppError(
    503,
    "השרת לא זמין. הפעל מחדש את npm run dev:twilio.",
  );
}

export async function warnIfWebhookUnreachable(): Promise<void> {
  const config = await getTelephonyConfig();
  if (config.provider !== "twilio") return;

  const url = config.webhookBaseUrl ?? process.env.TWILIO_WEBHOOK_BASE_URL;
  if (!url) {
    logger.warn("TWILIO_WEBHOOK_BASE_URL is not set — auto-repair will start a tunnel");
    void repairTwilioWebhookTunnel();
    return;
  }

  if (await probeWebhookBaseUrl(url)) {
    broadcastTunnelStatus(true, url);
    return;
  }

  logger.warn({ url }, "Twilio webhook unreachable — starting auto-repair");
  void repairTwilioWebhookTunnel();
}

/** Background probe + repair so tunnels recover without manual restarts. */
export function startTwilioWebhookWatchdog(): void {
  if (watchdogTimer) return;

  watchdogTimer = setInterval(() => {
    void (async () => {
      const config = await getTelephonyConfig();
      if (config.provider !== "twilio") return;

      refreshEnvWebhookFromDisk();
      const url =
        currentPublicUrl ??
        process.env.TWILIO_WEBHOOK_BASE_URL ??
        config.webhookBaseUrl;
      if (url && (await probeWebhookBaseUrl(url))) {
        broadcastTunnelStatus(true, url);
        return;
      }

      logger.info("Twilio webhook watchdog: tunnel down, repairing");
      await repairTwilioWebhookTunnel();
    })();
  }, WATCHDOG_INTERVAL_MS);
  watchdogTimer.unref();
}

export function getTwilioTunnelStatus(): {
  reachable: boolean | null;
  webhookBaseUrl: string | null;
  managedByServer: boolean;
} {
  return {
    reachable: lastTunnelReachable,
    webhookBaseUrl:
      currentPublicUrl ?? process.env.TWILIO_WEBHOOK_BASE_URL ?? null,
    managedByServer: tunnelProcess !== null,
  };
}
