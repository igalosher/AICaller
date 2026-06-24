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
  currentStage?: string | null;
  currentNodeId?: string | null;
  summary?: string | null;
  startedAt: string;
  endedAt?: string | null;
  durationSec?: number | null;
  contact?: Contact;
  transcript?: TranscriptSegment[];
}

export interface TranscriptSegment {
  id: string;
  speaker: string;
  text: string;
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

export interface FlowNode {
  id: string;
  type: "speak" | "listen" | "decision" | "intent_route" | "end";
  label?: string;
  text?: string;
  useLlm?: boolean;
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
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  startNodeId: string;
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
