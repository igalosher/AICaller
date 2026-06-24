import type { ClassificationResult, FlowGraph, FlowNode } from "./graphTypes.js";
import { resolveTemplate } from "../utils/template.js";

export class GraphFlowEngine {
  constructor(
    private graph: FlowGraph,
    public currentNodeId: string,
  ) {}

  getGraph(): FlowGraph {
    return this.graph;
  }

  getCurrentNode(): FlowNode | undefined {
    return this.graph.nodes.find((n) => n.id === this.currentNodeId);
  }

  getOutgoingEdges(nodeId?: string) {
    const id = nodeId ?? this.currentNodeId;
    return this.graph.edges.filter((e) => e.source === id);
  }

  getNextAutoEdge(nodeId?: string) {
    const outgoing = this.getOutgoingEdges(nodeId);
    if (outgoing.length === 1) return outgoing[0];
    return outgoing.find((e) => !e.intentId && !e.isDefault) ?? outgoing[0];
  }

  advanceByClassification(
    classification: ClassificationResult,
    intentThresholds: Record<string, number>,
  ): FlowNode | null {
    const node = this.getCurrentNode();
    if (!node) return null;

    if (node.type === "end") return node;

    if (node.type === "speak") {
      const edge = this.getNextAutoEdge();
      if (edge) {
        this.currentNodeId = edge.target;
        return this.getCurrentNode() ?? null;
      }
      return node;
    }

    if (node.type === "listen" || node.type === "intent_route" || node.type === "decision") {
      const outgoing = this.getOutgoingEdges();
      const threshold = intentThresholds[classification.intentId] ?? 0.7;
      let targetId: string | undefined;

      if (classification.confidence >= threshold) {
        const intentEdge = outgoing.find((e) => e.intentId === classification.intentId);
        if (intentEdge) targetId = intentEdge.target;
      }

      if (!targetId) {
        const defaultEdge = outgoing.find((e) => e.isDefault);
        targetId = defaultEdge?.target;
      }

      if (!targetId && outgoing.length === 1) {
        targetId = outgoing[0]!.target;
      }

      if (targetId) {
        this.currentNodeId = targetId;
        return this.getCurrentNode() ?? null;
      }
    }

    return node;
  }

  advanceFromListen(): FlowNode | null {
    const node = this.getCurrentNode();
    if (node?.type !== "listen") return node ?? null;
    const edge = this.getNextAutoEdge();
    if (!edge) return node;
    this.currentNodeId = edge.target;
    return this.getCurrentNode() ?? null;
  }

  advanceThroughSpeakChain(): FlowNode | null {
    let node = this.getCurrentNode();
    let guard = 0;
    while (node && node.type === "speak" && guard < 20) {
      const edge = this.getNextAutoEdge(node.id);
      if (!edge) break;
      this.currentNodeId = edge.target;
      node = this.getCurrentNode();
      guard++;
    }
    return node ?? null;
  }

  renderSpeakText(
    node: FlowNode & { type: "speak" },
    vars: Record<string, string>,
  ): string {
    return resolveTemplate(node.text, vars);
  }

  isEndNode(node?: FlowNode): node is FlowNode & { type: "end" } {
    return node?.type === "end";
  }
}

export function parseFlowGraph(json: string): FlowGraph {
  const parsed = JSON.parse(json) as FlowGraph;
  if (!parsed.startNodeId || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error("גרף זרימה לא תקין");
  }
  return parsed;
}

export function createEngineFromGraph(
  graphJson: string,
  startNodeId?: string,
): GraphFlowEngine {
  const graph = parseFlowGraph(graphJson);
  return new GraphFlowEngine(graph, startNodeId ?? graph.startNodeId);
}
