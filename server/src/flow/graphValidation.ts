import type { FlowGraph } from "./graphTypes.js";

export interface ValidationError {
  messageHe: string;
  nodeId?: string;
}

export function validateFlowGraph(graph: FlowGraph): ValidationError[] {
  const errors: ValidationError[] = [];
  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  if (!graph.startNodeId || !nodeIds.has(graph.startNodeId)) {
    errors.push({ messageHe: "חסר צומת התחלה תקין" });
  }

  const endNodes = graph.nodes.filter((n) => n.type === "end");
  if (endNodes.length === 0) {
    errors.push({ messageHe: "הזרימה חייבת לכלול לפחות צומת סיום אחד" });
  }

  for (const node of graph.nodes) {
    if (node.type === "speak" && node.text.trim().length === 0) {
      errors.push({ nodeId: node.id, messageHe: `צומת דיבור ${node.id} חסר טקסט` });
    }
  }

  const routeNodes = graph.nodes.filter((n) => n.type === "intent_route" || n.type === "decision");
  for (const node of routeNodes) {
    const outgoing = graph.edges.filter((e) => e.source === node.id);
    if (outgoing.length === 0) {
      errors.push({
        nodeId: node.id,
        messageHe: `לצומת ${node.label ?? node.id} אין יציאות מחוברות`,
      });
      continue;
    }
    const hasDefault = outgoing.some((e) => e.isDefault);
    if (!hasDefault && node.type !== "decision") {
      errors.push({
        nodeId: node.id,
        messageHe: `לצומת ${node.label ?? node.id} חסרה יציאת ברירת מחדל`,
      });
    }
  }

  if (graph.startNodeId) {
    const reachable = new Set<string>();
    const queue = [graph.startNodeId];
    while (queue.length > 0) {
      const id = queue.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const e of graph.edges.filter((edge) => edge.source === id)) {
        queue.push(e.target);
      }
    }
    const unreachable = graph.nodes.filter((n) => !reachable.has(n.id));
    for (const n of unreachable) {
      if (n.id !== graph.startNodeId) {
        errors.push({ nodeId: n.id, messageHe: `צומת ${n.label ?? n.id} לא נגיש מההתחלה` });
      }
    }
    const canReachEnd = endNodes.some((n) => reachable.has(n.id));
    if (!canReachEnd) {
      errors.push({ messageHe: "אין נתיב מההתחלה לצומת סיום" });
    }
  }

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      errors.push({ messageHe: `קשת ${edge.id} מצביעה על צומת לא קיים` });
    }
  }

  return errors;
}
