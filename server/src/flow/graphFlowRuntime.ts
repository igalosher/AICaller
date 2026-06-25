import type { GraphFlowEngine } from "./graphFlowEngine.js";
import type {
  FlowGraph,
  FlowNode,
  FlowVariableBinding,
  SideFlowDef,
  SpeakNode,
} from "./graphTypes.js";
import { initSessionVariables } from "./variableBinding.js";

export type TestRewindSnapshot = {
  currentNodeId: string;
  variables?: Record<string, unknown>;
  lastSpokenText?: string;
  mainCheckpoint?: import("./graphTypes.js").MainFlowCheckpoint;
  lastTranscriptSegmentId: string;
};

export type GraphCallContext = {
  lastSpokenText?: string;
  variables?: Record<string, unknown>;
  mainCheckpoint?: import("./graphTypes.js").MainFlowCheckpoint;
  /** Test-call only: stack of graph positions after each AI line (for step rewind). */
  testRewindStack?: TestRewindSnapshot[];
};

const ENTITY_PATH_TO_INTENT: Record<string, string> = {
  tv_count: "provide_tv_count",
  address: "provide_address",
  monthly_price: "provide_current_price",
};

const VARIABLE_TO_INTENT: Record<string, string> = {
  NumOfTVs: "provide_tv_count",
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
      mainCheckpoint: parsed.mainCheckpoint,
      testRewindStack: parsed.testRewindStack,
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

export function findSideFlow(graph: FlowGraph, intentId: string): SideFlowDef | undefined {
  return graph.sideFlows?.find((sf) => sf.intentId === intentId);
}

function intentIdFromBinding(binding: FlowVariableBinding): string | undefined {
  if (binding.source === "intent") {
    return typeof binding.path === "string" ? binding.path : undefined;
  }
  if (binding.source === "entity") {
    if (binding.path && ENTITY_PATH_TO_INTENT[binding.path]) {
      return ENTITY_PATH_TO_INTENT[binding.path];
    }
    if (binding.variableName && VARIABLE_TO_INTENT[binding.variableName]) {
      return VARIABLE_TO_INTENT[binding.variableName];
    }
  }
  if (binding.source === "raw_text") {
    return "provide_address";
  }
  return undefined;
}

/** Intents that count as a direct answer on this listen (route edges + variable bindings). */
export function getListenScopedIntentIds(graph: FlowGraph, listenNodeId: string): string[] {
  const intents = new Set<string>();
  const routeId = listenNodeId.replace(/^listen_/, "route_");
  for (const edge of graph.edges) {
    if (edge.source === routeId && edge.intentId && !edge.isDefault) {
      intents.add(edge.intentId);
    }
  }
  for (const binding of graph.variableBindings ?? []) {
    if (binding.listenNodeId !== listenNodeId) continue;
    const fromBinding = intentIdFromBinding(binding);
    if (fromBinding) intents.add(fromBinding);
  }
  return [...intents];
}

export function isMainPathAnswer(
  graph: FlowGraph,
  listenNodeId: string,
  classification: { intentId: string; confidence: number },
  thresholds: Record<string, number>,
): boolean {
  if (classification.intentId === "silence" || classification.intentId === "opt_out_remove") {
    return true;
  }
  const routeId = listenNodeId.replace(/^listen_/, "route_");
  if (!graph.nodes.some((n) => n.id === routeId)) return false;
  if (classificationMatchesExplicitRoute(graph, routeId, classification, thresholds)) {
    return true;
  }
  const scoped = getListenScopedIntentIds(graph, listenNodeId);
  const threshold = thresholds[classification.intentId] ?? 0.7;
  return scoped.includes(classification.intentId) && classification.confidence >= threshold;
}

/** Resolve the listen checkpoint id from engine position (listen, or route/decision after listen). */
export function resolveListenIdFromPosition(
  graph: FlowGraph,
  currentNodeId: string | null | undefined,
): string | null {
  if (!currentNodeId) return null;
  const node = graph.nodes.find((n) => n.id === currentNodeId);
  if (node?.type === "listen") return node.id;
  if (node?.type === "intent_route" || node?.type === "decision") {
    const edge = graph.edges.find((e) => e.target === currentNodeId);
    if (edge?.source.startsWith("listen_")) return edge.source;
  }
  return null;
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
  const sideFlow = findSideFlow(graph, classification.intentId);
  if (sideFlow) {
    const threshold = thresholds[classification.intentId] ?? 0.7;
    if (classification.confidence >= threshold) return false;
  }
  if (isMainPathAnswer(graph, listenId, classification, thresholds)) return false;
  return true;
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
  if (byConvention?.type === "speak") return byConvention;

  for (const edge of graph.edges.filter((e) => e.target === listenId)) {
    const node = graph.nodes.find((n) => n.id === edge.source);
    if (node?.type === "speak") return node as SpeakNode;
  }

  return undefined;
}

/** Route reached from a speak node without a listen (announcement handoff) — auto-continue. */
export function isOrphanAnnouncementRoute(engine: GraphFlowEngine): boolean {
  const node = engine.getCurrentNode();
  if (node?.type !== "intent_route") return false;
  if (getListenCheckpoint(engine)) return false;
  const incoming = engine.getGraph().edges.filter((e) => e.target === node.id);
  if (incoming.length === 0) return false;
  if (!incoming.every((e) => engine.getGraph().nodes.find((n) => n.id === e.source)?.type === "speak")) {
    return false;
  }
  const outgoing = engine.getOutgoingEdges();
  return outgoing.length > 0 && outgoing.every((e) => e.target.startsWith("speak_"));
}

export function advanceOrphanAnnouncementRoute(engine: GraphFlowEngine): FlowNode | null {
  if (!isOrphanAnnouncementRoute(engine)) return engine.getCurrentNode() ?? null;
  const outgoing = engine.getOutgoingEdges().filter((e) => e.target.startsWith("speak_"));
  const edge = outgoing.find((e) => e.isDefault) ?? outgoing[0];
  if (!edge) return engine.getCurrentNode() ?? null;
  engine.currentNodeId = edge.target;
  return engine.getCurrentNode() ?? null;
}
