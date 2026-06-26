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

export interface FlowNode {
  id: string;
  type: "speak" | "listen" | "decision" | "intent_route" | "end";
  label?: string;
  text?: string;
  useLlm?: boolean;
  returnsToMain?: boolean;
  outcome?: string;
  position?: { x: number; y: number };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  intentId?: string;
  isDefault?: boolean;
  condition?: FlowEdgeCondition;
}

export interface SideFlowDef {
  id: string;
  intentId: string;
  entryNodeId: string;
  label?: string;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  startNodeId: string;
  variables?: FlowVariableDef[];
  lookupTables?: FlowLookupTableDef[];
  variableBindings?: FlowVariableBinding[];
  interruptQa?: boolean;
  sideFlows?: SideFlowDef[];
}

export interface FlowAiEditResult {
  draftGraph: FlowGraph;
  summaryHe: string;
  affectedNodeIds: string[];
}

export const CONDITION_OP_LABELS: Record<ConditionOp, string> = {
  var_eq: "שווה ל",
  var_gt: "גדול מ",
  var_lt: "קטן מ",
  var_gte: "גדול או שווה ל",
  var_lte: "קטן או שווה ל",
  var_empty: "ריק",
  var_not_empty: "לא ריק",
  lookup_exists: "קיים בטבלה",
};

export const VARIABLE_TYPE_LABELS: Record<FlowVariableType, string> = {
  string: "טקסט",
  int: "מספר שלם",
  bool: "כן/לא",
  json: "JSON",
};

// Keep existing exports below
export type ContactStatus = "pending" | "in_call" | "sold" | "callback" | "refused" | "blacklisted";
export type ContactSex = "male" | "female";

export const CONTACT_SEX_LABELS: Record<ContactSex, string> = {
  male: "זכר",
  female: "נקבה",
};

export interface Contact {
  id: string;
  firstName: string;
  familyName: string;
  phone: string;
  sex: ContactSex;
  status: ContactStatus;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function contactDisplayName(contact: Pick<Contact, "firstName" | "familyName">): string {
  return [contact.firstName, contact.familyName].filter(Boolean).join(" ");
}

export interface Call {
  id: string;
  contactId: string;
  status: string;
  outcome: string;
  externalCallId?: string | null;
  currentStage?: string | null;
  currentNodeId?: string | null;
  summary?: string | null;
  startedAt: string;
  endedAt?: string | null;
  durationSec?: number | null;
  conversationMode?: "flow" | "agent";
  contact?: Contact;
  transcript?: TranscriptSegment[];
}

export interface TranscriptSegment {
  id: string;
  speaker: string;
  text: string;
  flowNodeId?: string | null;
  timestamp: string;
  classification?: UtteranceClassification | null;
}

export interface UtteranceClassification {
  id: string;
  intentId: string;
  confidence: number;
  entitiesJson: string;
  classifier: string;
  debugJson?: string | null;
  intent?: Intent;
}

export interface Intent {
  id: string;
  labelHe: string;
  descriptionHe: string;
  category: string;
  active: boolean;
  confidenceThreshold: number;
  examples?: { id: string; phrase: string }[];
  usageCount?: number;
}

export interface SalesPacket {
  id: string;
  nameHe: string;
  descriptionHe: string;
  priceMonthly: number;
  contractMonths: number;
  active: boolean;
  channelIds: string;
}

export interface CallFlow {
  id: string;
  version: number;
  openingTemplate: string;
  stagesJson: string;
  objectionsJson: string;
  draftGraphJson?: string;
  publishedGraphJson?: string;
  isActive: boolean;
}

export interface DashboardSummary {
  total: number;
  pending: number;
  refused: number;
  soldToday: number;
  activeCall: boolean;
}

export interface AgentConfig {
  missionHe: string;
  limitsHe: string;
  policiesHe: string;
  openingTemplateHe: string;
  maxRejections: number;
  updatedAt?: string;
}

export interface AgentResponseExample {
  id: string;
  customerText: string;
  aiResponseBad?: string | null;
  correctedText: string;
  callId?: string | null;
  segmentId?: string | null;
  createdAt: string;
}
