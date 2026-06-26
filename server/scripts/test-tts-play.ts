import "dotenv/config";
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
console.log("call", callId, "mode", call!.conversationMode);

const result = await new Promise<{ type: string; message?: string; audioLen?: number }>(
  (resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:3001/ws/test-call?callId=${callId}`);
    const t = setTimeout(() => reject(new Error("timeout 60s")), 60_000);
    ws.on("open", () => ws.send(JSON.stringify({ type: "start" })));
    ws.on("message", (d) => {
      const msg = JSON.parse(d.toString()) as { type: string; message?: string; audio?: string };
      if (msg.type === "ready") {
        console.log("ready");
        return;
      }
      if (msg.type === "play") {
        clearTimeout(t);
        ws.close();
        resolve({ type: "play", audioLen: msg.audio?.length ?? 0 });
        return;
      }
      if (msg.type === "error") {
        clearTimeout(t);
        ws.close();
        resolve({ type: "error", message: msg.message });
      }
    });
    ws.on("error", reject);
  },
);

console.log("result", result);

await prisma.call.update({
  where: { id: callId },
  data: { status: "ended", endedAt: new Date() },
});
await prisma.$disconnect();
