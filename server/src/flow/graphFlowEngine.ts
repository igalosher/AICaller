import type { ClassificationResult, FlowGraph, FlowNode, VariableBinding } from "./graphTypes.js";
import { evaluateCondition } from "./conditionEvaluator.js";
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

  advanceByDecision(variables: Record<string, unknown>): FlowNode | null {
    const node = this.getCurrentNode();
    if (!node || node.type !== "decision") return node ?? null;

    const outgoing = this.getOutgoingEdges();
    const lookupTables = this.graph.lookupTables ?? [];

    for (const edge of outgoing) {
      if (edge.isDefault || !edge.condition) continue;
      if (evaluateCondition(edge.condition, variables, lookupTables)) {
        this.currentNodeId = edge.target;
        return this.getCurrentNode() ?? null;
      }
    }

    const defaultEdge = outgoing.find((e) => e.isDefault);
    if (defaultEdge) {
      this.currentNodeId = defaultEdge.target;
      return this.getCurrentNode() ?? null;
    }

    if (outgoing.length === 1) {
      this.currentNodeId = outgoing[0]!.target;
      return this.getCurrentNode() ?? null;
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
  return normalizeFlowGraph(parsed);
}

/** Lift legacy per-listen bindings to flow-level variableBindings */
export function normalizeFlowGraph(graph: FlowGraph): FlowGraph {
  if (graph.variableBindings?.length) return graph;

  const legacyBindings: FlowGraph["variableBindings"] = [];
  const nodes = graph.nodes.map((node) => {
    const legacy = node as { type: string; bindings?: VariableBinding[] };
    if (node.type === "listen" && legacy.bindings?.length) {
      for (const binding of legacy.bindings) {
        legacyBindings.push({ ...binding, listenNodeId: node.id });
      }
      const { bindings: _removed, ...rest } = legacy;
      return rest as FlowGraph["nodes"][number];
    }
    return node;
  });

  if (!legacyBindings.length) return graph;
  return { ...graph, nodes, variableBindings: legacyBindings };
}

export function createEngineFromGraph(
  graphJson: string,
  startNodeId?: string,
): GraphFlowEngine {
  const graph = parseFlowGraph(graphJson);
  return new GraphFlowEngine(graph, startNodeId ?? graph.startNodeId);
}
