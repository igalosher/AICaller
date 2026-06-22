import "dotenv/config";
import http from "node:http";
import { WebSocketServer } from "ws";
import { createApp } from "./app.js";
import { logger } from "./logger.js";
import { registerWsClient } from "./websocket/callEvents.js";
import { runSeed } from "./seed.js";
import { recoverStuckContacts } from "./services/callService.js";
import {
  handleTwilioMediaMessage,
  unregisterMediaStreamForWs,
} from "./voice/mediaSession.js";

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

server.on("upgrade", (req, socket, head) => {
  const path = req.url?.split("?")[0];

  if (path === "/ws/calls") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
    return;
  }

  if (path === "/api/webhooks/twilio/media") {
    mediaWss.handleUpgrade(req, socket, head, (ws) => {
      mediaWss.emit("connection", ws, req);
    });
    return;
  }

  socket.destroy();
});

async function main() {
  await runSeed();
  await recoverStuckContacts();
  server.listen(port, () => {
    logger.info({ port }, "AICaller server started");
  });
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
