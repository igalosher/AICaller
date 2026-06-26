import type { FlowGraph, FlowVariableDef, FlowVariableType } from "./graphTypes.js";
import { listLookupColumns, parseLookupRows, validateLookupTableSize } from "./lookupQuery.js";
import { collectSideFlowSpeakNodes, sideFlowNodeIds } from "./sideFlowRuntime.js";

export interface ValidationError {
  messageHe: string;
  nodeId?: string;
}

const VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isDefaultCompatible(value: unknown, type: FlowVariableType): boolean {
  try {
    if (type === "string") return typeof value === "string";
    if (type === "int") return typeof value === "number" && Number.isInteger(value);
    if (type === "bool") return typeof value === "boolean";
    if (type === "json") return typeof value === "object" && value !== null;
    return false;
  } catch {
    return false;
  }
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

  const variableNames = new Set<string>();
  for (const variable of graph.variables ?? []) {
    if (!VAR_NAME_RE.test(variable.name)) {
      errors.push({ messageHe: `שם משתנה לא תקין: ${variable.name}` });
    }
    if (variableNames.has(variable.name)) {
      errors.push({ messageHe: `שם משתנה כפול: ${variable.name}` });
    }
    variableNames.add(variable.name);
    if (
      variable.defaultValue !== undefined &&
      !isDefaultCompatible(variable.defaultValue, variable.type)
    ) {
      errors.push({ messageHe: `ערך ברירת מחדל לא תואם לסוג המשתנה ${variable.name}` });
    }
  }

  const lookupNames = new Set<string>();
  for (const table of graph.lookupTables ?? []) {
    if (!VAR_NAME_RE.test(table.name)) {
      errors.push({ messageHe: `שם טבלת חיפוש לא תקין: ${table.name}` });
    }
    if (lookupNames.has(table.name)) {
      errors.push({ messageHe: `שם טבלת חיפוש כפול: ${table.name}` });
    }
    lookupNames.add(table.name);
    try {
      parseLookupRows(table.rows);
      const sizeErr = validateLookupTableSize(table);
      if (sizeErr) errors.push({ messageHe: sizeErr });
    } catch (err) {
      errors.push({
        messageHe: err instanceof Error ? err.message : `טבלת חיפוש ${table.name} לא תקינה`,
      });
    }
  }

  for (const binding of graph.variableBindings ?? []) {
    if (!nodeIds.has(binding.listenNodeId)) {
      errors.push({
        messageHe: `קישור משתנה "${binding.variableName}" מפנה לצומת האזנה לא קיים`,
      });
    } else if (!graph.nodes.some((n) => n.id === binding.listenNodeId && n.type === "listen")) {
      errors.push({
        messageHe: `קישור משתנה "${binding.variableName}" מפנה לצומת שאינו האזנה`,
      });
    }
    if (!variableNames.has(binding.variableName)) {
      errors.push({
        messageHe: `קישור משתנה: "${binding.variableName}" לא מוגדר ברמת הזרימה`,
      });
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
    if (!hasDefault) {
      errors.push({
        nodeId: node.id,
        messageHe: `לצומת ${node.label ?? node.id} חסרה יציאת ברירת מחדל`,
      });
    }

    if (node.type === "decision") {
      for (const edge of outgoing) {
        if (edge.isDefault) continue;
        if (!edge.condition) {
          errors.push({
            nodeId: node.id,
            messageHe: `לצומת החלטה ${node.label ?? node.id} חסרה תנאי בקשת "${edge.label ?? edge.id}"`,
          });
          continue;
        }
        const cond = edge.condition;
        if (cond.op.startsWith("var_") && cond.op !== "var_empty" && cond.op !== "var_not_empty") {
          if (!cond.variable || !variableNames.has(cond.variable)) {
            errors.push({
              nodeId: node.id,
              messageHe: `תנאי בקשת ${edge.id} מפנה למשתנה לא מוגדר`,
            });
          }
        }
        if (cond.op === "var_empty" || cond.op === "var_not_empty") {
          if (!cond.variable || !variableNames.has(cond.variable)) {
            errors.push({
              nodeId: node.id,
              messageHe: `תנאי בקשת ${edge.id} מפנה למשתנה לא מוגדר`,
            });
          }
        }
        if (cond.op === "lookup_exists") {
          if (!cond.table || !lookupNames.has(cond.table)) {
            errors.push({
              nodeId: node.id,
              messageHe: `תנאי בקשת ${edge.id} מפנה לטבלת חיפוש לא מוגדרת`,
            });
          }
          if (!cond.column) {
            errors.push({
              nodeId: node.id,
              messageHe: `תנאי בקשת ${edge.id} חסר עמודה`,
            });
          } else if (cond.table && lookupNames.has(cond.table)) {
            const table = graph.lookupTables?.find((t) => t.name === cond.table);
            const cols = table ? listLookupColumns(table.rows) : [];
            if (cols.length > 0 && !cols.includes(cond.column)) {
              errors.push({
                nodeId: node.id,
                messageHe: `תנאי בקשת ${edge.id}: עמודה "${cond.column}" לא קיימת בטבלה`,
              });
            }
          }
        }
      }
    }
  }

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      errors.push({ messageHe: `קשת ${edge.id} מצביעה על צומת לא קיים` });
    }
  }

  for (const sf of graph.sideFlows ?? []) {
    if (!nodeIds.has(sf.entryNodeId)) {
      errors.push({ messageHe: `זרימת צד "${sf.label ?? sf.id}": צומת כניסה לא קיים` });
      continue;
    }
    const entry = graph.nodes.find((n) => n.id === sf.entryNodeId);
    if (entry?.type !== "speak") {
      errors.push({ messageHe: `זרימת צד "${sf.label ?? sf.id}": כניסה חייבת להיות צומת דיבור` });
    }
    const speaks = collectSideFlowSpeakNodes(graph, sf.entryNodeId);
    if (speaks.length === 0) {
      errors.push({ messageHe: `זרימת צד "${sf.label ?? sf.id}": אין צמתי דיבור בשרשרת` });
    } else if (!speaks[speaks.length - 1]?.returnsToMain) {
      const lastId = speaks[speaks.length - 1]!.id;
      const nextEdge = graph.edges.find((e) => e.source === lastId);
      const nextNode = nextEdge && graph.nodes.find((n) => n.id === nextEdge.target);
      if (!nextNode || nextNode.type !== "listen") {
        errors.push({
          messageHe: `זרימת צד "${sf.label ?? sf.id}": סמן "חזרה לזרימה הראשית" בצומת האחרון`,
        });
      }
    }
  }

  const exemptFromReachability = sideFlowNodeIds(graph);

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
    const unreachable = graph.nodes.filter(
      (n) => !reachable.has(n.id) && !exemptFromReachability.has(n.id),
    );
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

  return errors;
}

// re-export for tests
export type { FlowVariableDef };
