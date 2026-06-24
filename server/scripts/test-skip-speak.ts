/**
 * Browser test-call skip_speak protocol (requires server on :3001).
 * Run: npm run test:skip-speak
 */
import assert from "node:assert/strict";
import WebSocket from "ws";
import { prisma } from "../src/db.js";
import { startTestCall } from "../src/services/callService.js";

type ServerMessage = { type: string };

function waitForMessage(
  ws: WebSocket,
  type: string,
  timeoutMs: number,
): Promise<ServerMessage | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      ws.off("message", onMessage);
      resolve(null);
    }, timeoutMs);

    function onMessage(data: WebSocket.RawData) {
      const msg = JSON.parse(data.toString()) as ServerMessage;
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off("message", onMessage);
        resolve(msg);
      }
    }

    ws.on("message", onMessage);
  });
}

function collectMessages(ws: WebSocket, durationMs: number): Promise<ServerMessage[]> {
  const messages: ServerMessage[] = [];
  return new Promise((resolve) => {
    function onMessage(data: WebSocket.RawData) {
      messages.push(JSON.parse(data.toString()) as ServerMessage);
    }
    ws.on("message", onMessage);
    setTimeout(() => {
      ws.off("message", onMessage);
      resolve(messages);
    }, durationMs);
  });
}

const contact = await prisma.contact.findFirst({
  where: { deletedAt: null, status: { not: "in_call" } },
});
if (!contact) {
  console.log("no contact");
  process.exit(1);
}

const call = await startTestCall(contact.id);
const callId = call!.id;
console.log("test call", callId);

const ws = new WebSocket(`ws://localhost:3001/ws/test-call?callId=${callId}`);
await new Promise<void>((resolve, reject) => {
  ws.once("open", () => resolve());
  ws.once("error", reject);
});
ws.send(JSON.stringify({ type: "start" }));

const ready = await waitForMessage(ws, "ready", 10_000);
assert.ok(ready, "expected ready");

// Skip while not speaking — server should ignore (no speak_skipped)
ws.send(JSON.stringify({ type: "skip_speak" }));
const early = await collectMessages(ws, 400);
assert.equal(
  early.some((m) => m.type === "speak_skipped"),
  false,
  "skip_speak without active play must not ack",
);
console.log("✓ skip ignored when not speaking");

const play = await waitForMessage(ws, "play", 20_000);
if (!play) {
  console.log("⚠ no play clip (ElevenLabs key?) — protocol test partial only");
} else {
  ws.send(JSON.stringify({ type: "skip_speak" }));
  const skipped = await waitForMessage(ws, "speak_skipped", 3_000);
  assert.ok(skipped, "expected speak_skipped after play");
  console.log("✓ speak_skipped after skip during play");

  const segments = await prisma.callTranscriptSegment.findMany({ where: { callId } });
  const customerLines = segments.filter((s) => s.speaker === "customer");
  assert.equal(customerLines.length, 0, "skip must not add customer transcript");
  console.log("✓ no customer transcript from skip");
}

ws.close();

console.log("\n--- Manual QA checklist ---");
console.log("4.1 Long opening: skip mid-play → full AI transcript, next reply advances flow");
console.log("4.2 During playback: skip vs typed reply → only typed reply classifies");

await prisma.$disconnect();
