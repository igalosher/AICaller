import type {
  ClassificationResult,
  FlowVariableBinding,
  FlowVariableDef,
  FlowVariableType,
  VariableBinding,
} from "./graphTypes.js";

export function initSessionVariables(defs: FlowVariableDef[] = []): Record<string, unknown> {
  const vars: Record<string, unknown> = {};
  for (const def of defs) {
    if (def.defaultValue !== undefined) {
      vars[def.name] = coerceToType(def.defaultValue, def.type);
    }
  }
  return vars;
}

export function applyListenBindings(
  bindings: FlowVariableBinding[] | undefined,
  listenNodeId: string,
  classification: ClassificationResult,
  rawText: string,
  variableDefs: FlowVariableDef[],
  variables: Record<string, unknown>,
): Record<string, unknown> {
  const relevant = bindings?.filter((b) => b.listenNodeId === listenNodeId) ?? [];
  if (!relevant.length) return variables;
  const defMap = new Map(variableDefs.map((d) => [d.name, d]));
  const next = { ...variables };

  for (const binding of relevant) {
    const def = defMap.get(binding.variableName);
    if (!def) continue;
    const raw = extractBindingValue(binding, classification, rawText);
    if (raw === undefined) continue;
    next[binding.variableName] = coerceToType(raw, def.type);
  }

  return next;
}

function extractBindingValue(
  binding: VariableBinding & { variableName?: string },
  classification: ClassificationResult,
  rawText: string,
): unknown {
  if (binding.source === "raw_text") return rawText.trim();
  if (binding.source === "intent") return classification.intentId;
  if (binding.source === "entity") {
    return resolveEntityForBinding(binding, classification);
  }
  return undefined;
}

/** Prefer variable name as entity key; fall back to legacy path, then intent defaults. */
function resolveEntityForBinding(
  binding: VariableBinding & { variableName?: string },
  classification: ClassificationResult,
): unknown {
  const entities = classification.entities;
  const variableName = binding.variableName;

  if (variableName) {
    const byVar = entities[variableName as keyof typeof entities];
    if (byVar !== undefined) return byVar;
  }

  if (binding.path) {
    const byPath = entities[binding.path as keyof typeof entities];
    if (byPath !== undefined) return byPath;
  }

  return standardEntityForIntent(classification.intentId, entities);
}

function standardEntityForIntent(
  intentId: string,
  entities: ClassificationResult["entities"],
): unknown {
  switch (intentId) {
    case "provide_tv_count":
      return entities.tv_count;
    case "provide_address":
      return entities.address;
    case "provide_current_price":
      return entities.monthly_price;
    default:
      return undefined;
  }
}

export function coerceToType(value: unknown, type: FlowVariableType): unknown {
  switch (type) {
    case "string":
      return value === null || value === undefined ? "" : String(value);
    case "int": {
      if (typeof value === "number") return Math.trunc(value);
      const n = Number(String(value).trim());
      return Number.isNaN(n) ? 0 : Math.trunc(n);
    }
    case "bool":
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return value !== 0;
      return ["true", "1", "כן", "yes"].includes(String(value).trim().toLowerCase());
    case "json":
      if (typeof value === "object" && value !== null) return value;
      try {
        return JSON.parse(String(value));
      } catch {
        return value;
      }
    default:
      return value;
  }
}

export function formatVariableForSpeak(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "כן" : "לא";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function flowVariablesForTemplate(
  variables: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    out[key] = formatVariableForSpeak(value);
  }
  return out;
}
