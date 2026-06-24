import type { FlowEdgeCondition, FlowLookupTableDef } from "./graphTypes.js";
import { lookupExists } from "./lookupQuery.js";

export function isVariableEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}

export function evaluateCondition(
  condition: FlowEdgeCondition,
  variables: Record<string, unknown>,
  lookupTables: FlowLookupTableDef[],
): boolean {
  switch (condition.op) {
    case "var_empty":
      return isVariableEmpty(variables[condition.variable ?? ""]);
    case "var_not_empty":
      return !isVariableEmpty(variables[condition.variable ?? ""]);
    case "lookup_exists": {
      const table = condition.table ?? "";
      const column = condition.column ?? "";
      const value = resolveCompareValue(condition, variables);
      return lookupExists(lookupTables, table, column, value);
    }
    case "var_eq":
      return compareValues(variables[condition.variable ?? ""], condition.literal) === 0;
    case "var_gt":
      return compareValues(variables[condition.variable ?? ""], condition.literal) > 0;
    case "var_lt":
      return compareValues(variables[condition.variable ?? ""], condition.literal) < 0;
    case "var_gte":
      return compareValues(variables[condition.variable ?? ""], condition.literal) >= 0;
    case "var_lte":
      return compareValues(variables[condition.variable ?? ""], condition.literal) <= 0;
    default:
      return false;
  }
}

function resolveCompareValue(
  condition: FlowEdgeCondition,
  variables: Record<string, unknown>,
): unknown {
  if (condition.literal !== undefined) return condition.literal;
  if (condition.variable) return variables[condition.variable];
  return "";
}

function compareValues(left: unknown, right: unknown): number {
  const ln = coerceNumber(left);
  const rn = coerceNumber(right);
  if (ln !== null && rn !== null) {
    if (ln < rn) return -1;
    if (ln > rn) return 1;
    return 0;
  }
  const ls = left === null || left === undefined ? "" : String(left);
  const rs = right === null || right === undefined ? "" : String(right);
  return ls.localeCompare(rs, "he");
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}
