import "dotenv/config";
import http from "node:http";
import { WebSocketServer } from "ws";
import { createApp } from "./app.js";
import { logger } from "./logger.js";
import { registerWsClient } from "./websocket/callEvents.js";
import { runSeed } from "./seed.js";
import { recoverStuckContacts } from "./services/callService.js";
import { warnIfWebhookUnreachable, startTwilioWebhookWatchdog } from "./telephony/tunnelManager.js";
import {
  handleTwilioMediaMessage,
  unregisterMediaStreamForWs,
  warmDeepgramStt,
} from "./voice/mediaSession.js";
import { warmElevenLabsTts } from "./voice/tts.js";
import { handleBrowserTestConnection } from "./voice/browserTestSession.js";

const port = Number(process.env.PORT ?? 3001);
const app = createApp();
const server = http.createServer(app);

const wss = new WebSocketServer({ noServer: true });
wss.on("connection", (ws) => {
  registerWsClient(ws);
});

const mediaWss = new WebSocketServer({ noServer: true });
mediaWss.on("connection", (ws) => {
  ws.on("message", async (data) => {
    try {
      const message = JSON.parse(data.toString()) as {
        event?: string;
        streamSid?: string;
        start?: { customParameters?: Record<string, string>; streamSid?: string };
        media?: { payload?: string; track?: string };
      };
      await handleTwilioMediaMessage(ws, message);
    } catch {
      // ignore malformed frames
    }
  });

  ws.on("close", () => {
    unregisterMediaStreamForWs(ws);
  });
});

const testCallWss = new WebSocketServer({ noServer: true });
testCallWss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "", "http://localhost");
  const callId = url.searchParams.get("callId");
  if (!callId) {
    ws.close();
    return;
  }
  void handleBrowserTestConnection(ws, callId);
});

server.on("upgrade", (req, socket, head) => {
  const path = req.url?.split("?")[0];

  if (path === "/ws/calls") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
    return;
  }

  if (path === "/ws/test-call") {
    testCallWss.handleUpgrade(req, socket, head, (ws) => {
      testCallWss.emit("connection", ws, req);
    });
    return;
  }

  if (path === "/api/webhooks/twilio/media") {
    mediaWss.handleUpgrade(req, socket, head, (ws) => {
      logger.info("Twilio media WebSocket connected");
      mediaWss.emit("connection", ws, req);
    });
    return;
  }

  socket.destroy();
});

async function main() {
  await runSeed();
  await recoverStuckContacts();
  void warmElevenLabsTts();
  void warmDeepgramStt();

  const shutdown = (signal: string) => {
    logger.info({ signal }, "Shutting down server");
    wss.clients.forEach((client) => client.close());
    mediaWss.clients.forEach((client) => client.close());
    testCallWss.clients.forEach((client) => client.close());
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      logger.error({ port, err }, "Port already in use — stop the other server and restart");
      process.exit(1);
    }
    throw err;
  });
  server.listen(port, () => {
    logger.info({ port }, "AICaller server started");
    void warnIfWebhookUnreachable();
    startTwilioWebhookWatchdog();
  });
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
