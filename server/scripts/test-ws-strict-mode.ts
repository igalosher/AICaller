/**
 * Simulates React StrictMode double-mount: connect, close, reconnect same callId.
 */
import WebSocket from "ws";
import { prisma } from "../src/db.js";
import { startTestCall } from "../src/services/callService.js";

const contact = await prisma.contact.findFirst({
  where: { deletedAt: null, status: { not: "in_call" } },
});
if (!contact) {
  console.log("no contact");
  process.exit(1);
}

const call = await startTestCall(contact.id);
const callId = call!.id;
console.log("call", callId);

function connect(label: string): Promise<{ readyMs: number; playMs?: number }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:3001/ws/test-call?callId=${callId}`);
    const t0 = Date.now();
    let readyMs = -1;
    let playMs: number | undefined;

    ws.on("open", () => ws.send(JSON.stringify({ type: "start" })));
    ws.on("message", (d) => {
      const msg = JSON.parse(d.toString()) as { type: string };
      if (msg.type === "ready" && readyMs < 0) {
        readyMs = Date.now() - t0;
        console.log(label, "ready ms", readyMs);
        resolve({ readyMs, playMs });
        ws.close();
      }
      if (msg.type === "play" && playMs === undefined) {
        playMs = Date.now() - t0;
        console.log(label, "play ms", playMs);
      }
      if (msg.type === "error") {
        reject(new Error(msg.type));
      }
    });
    ws.on("error", reject);
    setTimeout(() => reject(new Error(`${label} timeout`)), 10_000);
  });
}

const ws1 = new WebSocket(`ws://localhost:3001/ws/test-call?callId=${callId}`);
await new Promise<void>((r) => ws1.on("open", () => r()));
ws1.send(JSON.stringify({ type: "start" }));
ws1.close();
console.log("ws1 closed (strict mode unmount)");

const result = await connect("ws2");
if (result.readyMs > 5000) {
  console.warn("ready slow but ok");
}
console.log("strict-mode reconnect ok");
await prisma.$disconnect();
