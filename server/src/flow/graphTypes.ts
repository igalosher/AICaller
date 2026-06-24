export type FlowNodeType = "speak" | "listen" | "decision" | "intent_route" | "end";

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
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  startNodeId: string;
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
  };
  classifier: "rule" | "llm";
  debug?: Record<string, unknown>;
}
