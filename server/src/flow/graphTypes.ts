export type FlowNodeType = "speak" | "listen" | "decision" | "intent_route" | "end";

export type FlowVariableType = "string" | "int" | "bool" | "json";

export type ConditionOp =
  | "var_eq"
  | "var_gt"
  | "var_lt"
  | "var_gte"
  | "var_lte"
  | "var_empty"
  | "var_not_empty"
  | "lookup_exists";

export interface FlowVariableDef {
  name: string;
  type: FlowVariableType;
  defaultValue?: string | number | boolean | Record<string, unknown> | unknown[];
}

export interface FlowLookupTableDef {
  name: string;
  rows: Record<string, unknown>[];
}

export interface VariableBinding {
  variableName: string;
  source: "entity" | "intent" | "raw_text";
  path?: string;
}

/** Flow-level binding: which listen question populates which variable */
export interface FlowVariableBinding extends VariableBinding {
  listenNodeId: string;
}

export interface FlowEdgeCondition {
  op: ConditionOp;
  variable?: string;
  literal?: string | number | boolean;
  table?: string;
  column?: string;
}

export interface FlowNodeBase {
  id: string;
  type: FlowNodeType;
  label?: string;
  position?: { x: number; y: number };
}

export interface SpeakNode extends FlowNodeBase {
  type: "speak";
  text: string;
  useLlm?: boolean;
  /** When true, after this line the runtime returns to the main flow and repeats the saved question. */
  returnsToMain?: boolean;
  /** Informational line — runtime chains directly to the next speak without waiting at listen/route. */
  autoAdvance?: boolean;
}

export interface ListenNode extends FlowNodeBase {
  type: "listen";
}

export interface DecisionNode extends FlowNodeBase {
  type: "decision";
  condition?: string;
}

export interface IntentRouteNode extends FlowNodeBase {
  type: "intent_route";
}

export interface EndNode extends FlowNodeBase {
  type: "end";
  outcome?: "sold" | "refused" | "callback" | "none";
}

export type FlowNode = SpeakNode | ListenNode | DecisionNode | IntentRouteNode | EndNode;

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  intentId?: string;
  isDefault?: boolean;
  condition?: FlowEdgeCondition;
}

/** Intent-triggered mini-flow disconnected from the main graph; returns to main when done. */
export interface SideFlowDef {
  id: string;
  intentId: string;
  entryNodeId: string;
  label?: string;
}

export interface MainFlowCheckpoint {
  listenNodeId: string;
  resumeNodeId: string;
  lastSpokenText: string;
  /** Active side flow while in a multi-turn side conversation. */
  sideFlowId?: string;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  startNodeId: string;
  variables?: FlowVariableDef[];
  lookupTables?: FlowLookupTableDef[];
  variableBindings?: FlowVariableBinding[];
  /** When true (default), product Q&A during listen checkpoints answers and re-asks the current question. */
  interruptQa?: boolean;
  /** Off-script flows entered by intent during a listen checkpoint; not required to connect to startNodeId. */
  sideFlows?: SideFlowDef[];
}

export interface ClassificationResult {
  intentId: string;
  confidence: number;
  entities: {
    channel?: string;
    channelId?: string;
    packet?: string;
    tv_count?: number;
    monthly_price?: number;
    address?: string;
    [key: string]: unknown;
  };
  classifier: "rule" | "llm";
  debug?: Record<string, unknown>;
}
