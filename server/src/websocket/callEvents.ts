import type { WebSocket } from "ws";

export type CallEvent =
  | { type: "call_status"; callId: string; status: string; stage?: string }
  | { type: "transcript"; callId: string; speaker: string; text: string }
  | { type: "call_ended"; callId: string; outcome: string };

const clients = new Set<WebSocket>();

export function registerWsClient(ws: WebSocket): void {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
}

export function broadcastCallEvent(event: CallEvent): void {
  const payload = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}
