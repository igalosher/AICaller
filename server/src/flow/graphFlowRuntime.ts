import type { GraphFlowEngine } from "./graphFlowEngine.js";
import type { SpeakNode } from "./graphTypes.js";

export type GraphCallContext = {
  lastSpokenText?: string;
};

const PRODUCT_QA_INTENTS = new Set([
  "ask_channel",
  "ask_packet",
  "ask_internet",
  "ask_router_rental",
  "ask_options_compare",
  "price_objection",
]);

export function parseGraphContext(json: string): GraphCallContext {
  try {
    const parsed = JSON.parse(json) as GraphCallContext;
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function serializeGraphContext(ctx: GraphCallContext): string {
  return JSON.stringify(ctx);
}

export function isProductQaIntent(intentId: string): boolean {
  return PRODUCT_QA_INTENTS.has(intentId);
}

export function getListenCheckpoint(engine: GraphFlowEngine): string | null {
  const node = engine.getCurrentNode();
  if (node?.type === "listen") return node.id;
  if (node?.type === "intent_route" || node?.type === "decision") {
    const edge = engine.getGraph().edges.find((e) => e.target === node.id);
    const source = edge?.source;
    if (source?.startsWith("listen_")) return source;
  }
  return null;
}

export function speakNodeForListen(
  engine: GraphFlowEngine,
  listenId: string,
): SpeakNode | undefined {
  const speakId = listenId.replace(/^listen_/, "speak_");
  const node = engine.getGraph().nodes.find((n) => n.id === speakId);
  return node?.type === "speak" ? node : undefined;
}
