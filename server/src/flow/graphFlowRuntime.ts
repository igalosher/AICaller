import type { GraphFlowEngine } from "./graphFlowEngine.js";
import type { FlowGraph, SpeakNode } from "./graphTypes.js";
import { initSessionVariables } from "./variableBinding.js";

export type GraphCallContext = {
  lastSpokenText?: string;
  variables?: Record<string, unknown>;
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
    if (typeof parsed !== "object" || !parsed) return { variables: {} };
    return {
      lastSpokenText: parsed.lastSpokenText,
      variables: parsed.variables ?? {},
    };
  } catch {
    return { variables: {} };
  }
}

export function serializeGraphContext(ctx: GraphCallContext): string {
  return JSON.stringify(ctx);
}

export function initGraphContext(graph: FlowGraph): GraphCallContext {
  return {
    variables: initSessionVariables(graph.variables ?? []),
  };
}

export function isProductQaIntent(intentId: string): boolean {
  return PRODUCT_QA_INTENTS.has(intentId);
}

export function isInterruptQaEnabled(graph: FlowGraph): boolean {
  return graph.interruptQa !== false;
}

/** True when classification matches a non-default edge on this route with sufficient confidence. */
export function classificationMatchesExplicitRoute(
  graph: FlowGraph,
  routeId: string,
  classification: { intentId: string; confidence: number },
  thresholds: Record<string, number>,
): boolean {
  const intentId = classification.intentId;
  if (intentId === "silence" || intentId === "opt_out_remove") return true;
  const outgoing = graph.edges.filter((e) => e.source === routeId);
  const threshold = thresholds[intentId] ?? 0.7;
  if (classification.confidence >= threshold) {
    const matched = outgoing.find((e) => e.intentId === intentId && !e.isDefault);
    if (matched) return true;
  }
  return false;
}

/** Customer asked something off-script — answer via LLM and repeat the current stage question. */
export function shouldInterruptQa(
  graph: FlowGraph,
  listenId: string,
  classification: { intentId: string; confidence: number },
  thresholds: Record<string, number>,
): boolean {
  if (!isInterruptQaEnabled(graph)) return false;
  if (classification.intentId === "didnt_understand") return false;
  const routeId = listenId.replace(/^listen_/, "route_");
  if (!graph.nodes.some((n) => n.id === routeId)) return false;
  return !classificationMatchesExplicitRoute(graph, routeId, classification, thresholds);
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
  const graph = engine.getGraph();

  const byConvention = graph.nodes.find(
    (n) => n.id === listenId.replace(/^listen_/, "speak_") && n.type === "speak",
  );
  if (byConvention) return byConvention;

  for (const edge of graph.edges.filter((e) => e.target === listenId)) {
    const node = graph.nodes.find((n) => n.id === edge.source);
    if (node?.type === "speak") return node;
  }

  return undefined;
}
