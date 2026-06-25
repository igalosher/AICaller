import type {
  FlowEdge,
  FlowGraph,
  FlowNode,
  FlowVariableBinding,
  FlowVariableDef,
  SideFlowDef,
} from "./graphTypes.js";

export type FlowPatchOperation =
  | { op: "addNode"; node: FlowNode }
  | { op: "updateNode"; id: string; patch: Record<string, unknown> }
  | { op: "deleteNode"; id: string }
  | { op: "addEdge"; edge: FlowEdge }
  | { op: "updateEdge"; id: string; patch: Partial<FlowEdge> }
  | { op: "deleteEdge"; id: string }
  | { op: "updateSpeakText"; nodeId: string; text: string }
  | { op: "setVariable"; variable: FlowVariableDef }
  | { op: "deleteVariable"; name: string }
  | { op: "addVariableBinding"; binding: FlowVariableBinding }
  | { op: "deleteVariableBinding"; listenNodeId: string; variableName: string }
  | { op: "addSideFlow"; sideFlow: SideFlowDef }
  | { op: "deleteSideFlow"; id: string }
  | { op: "setStartNodeId"; startNodeId: string }
  | { op: "setInterruptQa"; interruptQa: boolean };

export interface FlowGraphPatch {
  operations: FlowPatchOperation[];
  summaryHe?: string;
  refused?: boolean;
  refusalHe?: string;
}

export interface ApplyPatchResult {
  graph: FlowGraph;
  affectedNodeIds: string[];
}

function cloneGraph(graph: FlowGraph): FlowGraph {
  return JSON.parse(JSON.stringify(graph)) as FlowGraph;
}

function collectAffectedIds(ops: FlowPatchOperation[], draft: FlowGraph): string[] {
  const ids = new Set<string>();
  for (const op of ops) {
    switch (op.op) {
      case "addNode":
        ids.add(op.node.id);
        break;
      case "updateNode":
      case "updateSpeakText":
        ids.add(op.op === "updateNode" ? op.id : op.nodeId);
        break;
      case "deleteNode":
        ids.add(op.id);
        break;
      case "addEdge":
        ids.add(op.edge.source);
        ids.add(op.edge.target);
        break;
      case "updateEdge":
      case "deleteEdge": {
        const edge = draft.edges.find((e) => e.id === op.id);
        if (edge) {
          ids.add(edge.source);
          ids.add(edge.target);
        }
        break;
      }
      case "addVariableBinding":
        ids.add(op.binding.listenNodeId);
        break;
      case "addSideFlow":
        ids.add(op.sideFlow.entryNodeId);
        break;
      default:
        break;
    }
  }
  return [...ids];
}

export function applyFlowGraphPatch(draft: FlowGraph, patch: FlowGraphPatch): ApplyPatchResult {
  const graph = cloneGraph(draft);
  const ops = patch.operations ?? [];

  for (const op of ops) {
    switch (op.op) {
      case "addNode":
        if (!graph.nodes.some((n) => n.id === op.node.id)) {
          graph.nodes.push(op.node);
        }
        break;
      case "updateNode": {
        const idx = graph.nodes.findIndex((n) => n.id === op.id);
        if (idx >= 0) {
          graph.nodes[idx] = { ...graph.nodes[idx], ...op.patch } as FlowNode;
        }
        break;
      }
      case "deleteNode":
        graph.nodes = graph.nodes.filter((n) => n.id !== op.id);
        graph.edges = graph.edges.filter((e) => e.source !== op.id && e.target !== op.id);
        if (graph.startNodeId === op.id) {
          graph.startNodeId = graph.nodes[0]?.id ?? graph.startNodeId;
        }
        break;
      case "addEdge":
        if (!graph.edges.some((e) => e.id === op.edge.id)) {
          graph.edges.push(op.edge);
        }
        break;
      case "updateEdge": {
        const idx = graph.edges.findIndex((e) => e.id === op.id);
        if (idx >= 0) {
          graph.edges[idx] = { ...graph.edges[idx], ...op.patch };
        }
        break;
      }
      case "deleteEdge":
        graph.edges = graph.edges.filter((e) => e.id !== op.id);
        break;
      case "updateSpeakText": {
        const idx = graph.nodes.findIndex((n) => n.id === op.nodeId);
        if (idx >= 0 && graph.nodes[idx]!.type === "speak") {
          graph.nodes[idx] = { ...graph.nodes[idx]!, text: op.text };
        }
        break;
      }
      case "setVariable": {
        graph.variables = graph.variables ?? [];
        const vIdx = graph.variables.findIndex((v) => v.name === op.variable.name);
        if (vIdx >= 0) graph.variables[vIdx] = op.variable;
        else graph.variables.push(op.variable);
        break;
      }
      case "deleteVariable":
        graph.variables = (graph.variables ?? []).filter((v) => v.name !== op.name);
        break;
      case "addVariableBinding": {
        graph.variableBindings = graph.variableBindings ?? [];
        const exists = graph.variableBindings.some(
          (b) => b.listenNodeId === op.binding.listenNodeId && b.variableName === op.binding.variableName,
        );
        if (!exists) graph.variableBindings.push(op.binding);
        break;
      }
      case "deleteVariableBinding":
        graph.variableBindings = (graph.variableBindings ?? []).filter(
          (b) => !(b.listenNodeId === op.listenNodeId && b.variableName === op.variableName),
        );
        break;
      case "addSideFlow": {
        graph.sideFlows = graph.sideFlows ?? [];
        if (!graph.sideFlows.some((s) => s.id === op.sideFlow.id)) {
          graph.sideFlows.push(op.sideFlow);
        }
        break;
      }
      case "deleteSideFlow":
        graph.sideFlows = (graph.sideFlows ?? []).filter((s) => s.id !== op.id);
        break;
      case "setStartNodeId":
        graph.startNodeId = op.startNodeId;
        break;
      case "setInterruptQa":
        graph.interruptQa = op.interruptQa;
        break;
      default:
        break;
    }
  }

  return { graph, affectedNodeIds: collectAffectedIds(ops, draft) };
}
