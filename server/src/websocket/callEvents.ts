import type { WebSocket } from "ws";

export type CallEvent =
  | { type: "call_status"; callId: string; status: string; stage?: string }
  | { type: "transcript"; callId: string; speaker: string; text: string; flowNodeId?: string }
  | {
      type: "classification";
      callId: string;
      segmentId: string;
      intentId: string;
      confidence: number;
    }
  | { type: "call_ended"; callId: string; outcome: string }
  | { type: "tunnel_status"; reachable: boolean; webhookBaseUrl?: string };

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
