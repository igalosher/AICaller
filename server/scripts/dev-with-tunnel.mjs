/**
 * Starts cloudflared, writes the public URL to server/.env, syncs DB, then runs npm run dev.
 * Use: npm run dev:twilio   (from repo root)
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = join(__dirname, "..");
const rootDir = join(serverDir, "..");
const envPath = join(serverDir, ".env");

const TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

function patchEnv(lines) {
  let content = readFileSync(envPath, "utf8");
  for (const [key, value] of Object.entries(lines)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*`, "m");
    if (re.test(content)) {
      content = content.replace(re, line);
    } else {
      content = `${content.trimEnd()}\n${line}\n`;
    }
    console.log(`[tunnel] ${line}`);
  }
  writeFileSync(envPath, content);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { shell: true, stdio: "inherit", ...opts });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function freePort(port) {
  if (process.platform !== "win32") return;
  try {
    await run("powershell", [
      "-NoProfile",
      "-Command",
      `$p = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if ($p) { $p | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }`,
    ]);
  } catch {
    // best effort
  }
}

async function waitForTunnelReady(publicUrl, attempts = 30) {
  const probe = `${publicUrl}/api/webhooks/twilio/voice?callId=healthcheck`;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(probe, { method: "POST" });
      if (res.ok) {
        console.log("[tunnel] Public webhook reachable");
        return true;
      }
    } catch {
      // server may still be starting
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.warn("[tunnel] Could not verify webhook yet — retry once the API is up");
  return false;
}

const children = [];
let shuttingDown = false;
let publicUrl = null;
let devStarted = false;
let restartTimer = null;

function track(child) {
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  shuttingDown = true;
  if (restartTimer) clearTimeout(restartTimer);
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function onTunnelUrl(url) {
  publicUrl = url;
  patchEnv({ TWILIO_WEBHOOK_BASE_URL: url, DEV_TWILIO_TUNNEL: "1" });
  try {
    await run("npx", ["tsx", "scripts/sync-webhook-url.ts"], { cwd: serverDir });
  } catch (err) {
    console.warn("[tunnel] DB sync skipped:", err.message);
  }

  if (!devStarted) {
    devStarted = true;
    await freePort(3001);
    console.log("\n[tunnel] Starting app (server + client)…\n");
    const dev = track(
      spawn("npm", ["run", "dev"], {
        cwd: rootDir,
        shell: true,
        stdio: "inherit",
      }),
    );
    dev.on("exit", (code) => shutdown(code ?? 0));
    setTimeout(() => void waitForTunnelReady(url), 8000);
    return;
  }

  console.log("[tunnel] Tunnel URL updated — re-probing webhook…");
  await waitForTunnelReady(url);
}

function startCloudflared() {
  console.log("[tunnel] Starting cloudflared → http://127.0.0.1:3001");
  console.log("[tunnel] Keep this terminal open while testing Twilio voice calls.\n");

  const tunnel = track(
    spawn("npx", ["--yes", "cloudflared", "tunnel", "--protocol", "http2", "--url", "http://127.0.0.1:3001"], {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );

  let urlAssigned = false;

  function onTunnelOutput(chunk) {
    const text = chunk.toString();
    process.stderr.write(text);
    if (urlAssigned || !TUNNEL_URL_RE.test(text)) return;

    const url = text.match(TUNNEL_URL_RE)?.[0];
    if (!url) return;
    urlAssigned = true;
    void onTunnelUrl(url);
  }

  tunnel.stdout.on("data", onTunnelOutput);
  tunnel.stderr.on("data", onTunnelOutput);

  tunnel.on("exit", (code) => {
    if (shuttingDown) return;
    if (!devStarted) {
      console.error("[tunnel] cloudflared exited before a public URL was assigned");
      shutdown(code ?? 1);
      return;
    }
    console.warn("\n[tunnel] cloudflared disconnected — restarting tunnel in 3s…\n");
    publicUrl = null;
    urlAssigned = false;
    restartTimer = setTimeout(() => startCloudflared(), 3000);
  });
}

startCloudflared();
