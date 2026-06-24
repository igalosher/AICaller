import type { GraphFlowEngine } from "./graphFlowEngine.js";
import type { FlowGraph, SideFlowDef, SpeakNode } from "./graphTypes.js";
import type { GraphCallContext } from "./graphFlowRuntime.js";
import { findSideFlow, isMainPathAnswer } from "./graphFlowRuntime.js";

export function isInSideFlow(ctx: GraphCallContext, engine: GraphFlowEngine): boolean {
  if (!ctx.mainCheckpoint) return false;
  return engine.currentNodeId !== ctx.mainCheckpoint.resumeNodeId;
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

export function sideFlowNodeIds(graph: FlowGraph): Set<string> {
  const ids = new Set<string>();
  for (const sf of graph.sideFlows ?? []) {
    for (const speak of collectSideFlowSpeakNodes(graph, sf.entryNodeId)) {
      ids.add(speak.id);
    }
  }
  return ids;
}
