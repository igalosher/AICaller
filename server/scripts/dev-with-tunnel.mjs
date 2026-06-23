/**
 * Starts cloudflared, writes the public URL to server/.env, syncs DB, then runs npm run dev.
 * Use: npm run dev:twilio   (from repo root)
 *
 * Twilio "Application Error" happens when TWILIO_WEBHOOK_BASE_URL points at a dead tunnel.
 * Quick trycloudflare tunnels die when the process stops — this script keeps them together.
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

function patchEnvWebhook(url) {
  let content = readFileSync(envPath, "utf8");
  const line = `TWILIO_WEBHOOK_BASE_URL=${url}`;
  if (/^TWILIO_WEBHOOK_BASE_URL=.*/m.test(content)) {
    content = content.replace(/^TWILIO_WEBHOOK_BASE_URL=.*/m, line);
  } else {
    content = `${content.trimEnd()}\n${line}\n`;
  }
  writeFileSync(envPath, content);
  console.log(`[tunnel] ${line}`);
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

async function waitForTunnelReady(publicUrl, attempts = 20) {
  const probe = `${publicUrl}/api/webhooks/twilio/voice?callId=healthcheck`;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(probe, { method: "POST" });
      if (res.ok) {
        console.log("[tunnel] Public webhook reachable");
        return;
      }
    } catch {
      // server may still be starting on first dev:twilio run — tunnel alone returns 502 until API is up
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.warn("[tunnel] Could not verify webhook yet (start dev server or retry a call once API is up)");
}

const children = [];

function track(child) {
  children.push(child);
  return child;
}

function shutdown(code = 0) {
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

console.log("[tunnel] Starting cloudflared → http://127.0.0.1:3001");
console.log("[tunnel] Keep this terminal open while testing Twilio voice calls.\n");

let publicUrl = null;
let devStarted = false;

const tunnel = track(
  spawn("npx", ["--yes", "cloudflared", "tunnel", "--protocol", "http2", "--url", "http://127.0.0.1:3001"], {
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  }),
);

function onTunnelOutput(chunk) {
  const text = chunk.toString();
  process.stderr.write(text);
  if (publicUrl || !TUNNEL_URL_RE.test(text)) return;

  publicUrl = text.match(TUNNEL_URL_RE)[0];
  void (async () => {
    patchEnvWebhook(publicUrl);
    try {
      await run("npx", ["tsx", "scripts/sync-webhook-url.ts"], { cwd: serverDir });
    } catch (err) {
      console.warn("[tunnel] DB sync skipped:", err.message);
    }

    if (devStarted) return;
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

    // Give the API a few seconds to listen, then verify tunnel end-to-end
    setTimeout(() => void waitForTunnelReady(publicUrl), 8000);
  })();
}

tunnel.stdout.on("data", onTunnelOutput);
tunnel.stderr.on("data", onTunnelOutput);

tunnel.on("exit", (code) => {
  if (!devStarted) {
    console.error("[tunnel] cloudflared exited before a public URL was assigned");
    shutdown(code ?? 1);
  }
});
