import type { GraphFlowEngine } from "./graphFlowEngine.js";
import type { FlowGraph, SideFlowDef, SpeakNode } from "./graphTypes.js";
import type { GraphCallContext } from "./graphFlowRuntime.js";
import { findSideFlow, isMainPathAnswer, isProductQaIntent } from "./graphFlowRuntime.js";

/** Customer signals they are done with the side-topic and wants to resume qualification. */
export const SIDE_FLOW_EXIT_INTENTS = new Set([
  "greeting_ack",
  "small_talk",
  "not_interested",
]);

export function isSideFlowExitIntent(intentId: string): boolean {
  return SIDE_FLOW_EXIT_INTENTS.has(intentId);
}

export function isInSideFlow(ctx: GraphCallContext, engine: GraphFlowEngine): boolean {
  if (!ctx.mainCheckpoint) return false;
  if (engine.currentNodeId === ctx.mainCheckpoint.resumeNodeId) return false;
  const active = findActiveSideFlow(engine.getGraph(), ctx, engine);
  return Boolean(active);
}

export function findActiveSideFlow(
  graph: FlowGraph,
  ctx: GraphCallContext,
  engine: GraphFlowEngine,
): SideFlowDef | undefined {
  if (!ctx.mainCheckpoint) return undefined;
  if (ctx.mainCheckpoint.sideFlowId) {
    return graph.sideFlows?.find((sf) => sf.id === ctx.mainCheckpoint!.sideFlowId);
  }
  const currentId = engine.currentNodeId;
  if (!currentId) return undefined;
  for (const sf of graph.sideFlows ?? []) {
    if (collectSideFlowSubgraphNodeIds(graph, sf.entryNodeId).has(currentId)) {
      return sf;
    }
  }
  return undefined;
}

export function shouldEnterSideFlow(
  graph: FlowGraph,
  listenNodeId: string,
  classification: { intentId: string; confidence: number },
  thresholds: Record<string, number>,
): SideFlowDef | undefined {
  const sideFlow = findSideFlow(graph, classification.intentId);
  if (!sideFlow) return undefined;
  if (isMainPathAnswer(graph, listenNodeId, classification, thresholds)) return undefined;
  const threshold = thresholds[classification.intentId] ?? 0.7;
  if (classification.confidence < threshold) return undefined;
  const entry = graph.nodes.find((n) => n.id === sideFlow.entryNodeId);
  if (!entry || entry.type !== "speak") return undefined;
  return sideFlow;
}

/** All nodes reachable from side-flow entry until a returnsToMain speak (exclusive). */
export function collectSideFlowSubgraphNodeIds(graph: FlowGraph, entryNodeId: string): Set<string> {
  const ids = new Set<string>();
  const queue = [entryNodeId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (ids.has(id)) continue;
    const node = graph.nodes.find((n) => n.id === id);
    if (!node) continue;
    ids.add(id);
    if (node.type === "speak" && node.returnsToMain) continue;
    for (const edge of graph.edges.filter((e) => e.source === id)) {
      queue.push(edge.target);
    }
  }
  return ids;
}

/** Walk a disconnected speak chain until returnsToMain, listen, or branch. */
export function collectSideFlowSpeakNodes(
  graph: FlowGraph,
  entryNodeId: string,
): SpeakNode[] {
  const speaks: SpeakNode[] = [];
  let nodeId: string | undefined = entryNodeId;
  let guard = 0;
  while (nodeId && guard < 20) {
    guard++;
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== "speak") break;
    speaks.push(node);
    if (node.returnsToMain) break;
    const edges = graph.edges.filter((e) => e.source === nodeId);
    if (edges.length !== 1) break;
    const next = graph.nodes.find((n) => n.id === edges[0]!.target);
    if (!next || next.type !== "speak") break;
    nodeId = next.id;
  }
  return speaks;
}

export function findSideFlowFarewellSpeak(
  graph: FlowGraph,
  entryNodeId: string,
): SpeakNode | undefined {
  const subgraph = collectSideFlowSubgraphNodeIds(graph, entryNodeId);
  return graph.nodes.find(
    (n): n is SpeakNode =>
      subgraph.has(n.id) && n.type === "speak" && Boolean((n as SpeakNode).returnsToMain),
  );
}

export function sideFlowNodeIds(graph: FlowGraph): Set<string> {
  const ids = new Set<string>();
  for (const sf of graph.sideFlows ?? []) {
    for (const id of collectSideFlowSubgraphNodeIds(graph, sf.entryNodeId)) {
      ids.add(id);
    }
  }
  return ids;
}

export function isSideFlowProductConversation(graph: FlowGraph, sideFlow: SideFlowDef): boolean {
  if (isProductQaIntent(sideFlow.intentId)) return true;
  const entry = graph.nodes.find((n) => n.id === sideFlow.entryNodeId);
  return Boolean(entry?.type === "speak" && entry.useLlm);
}
