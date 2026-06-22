export type ContactStatus = "pending" | "in_call" | "sold" | "callback" | "refused";

export interface Contact {
  id: string;
  name: string;
  phone: string;
  status: ContactStatus;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Call {
  id: string;
  contactId: string;
  status: string;
  outcome: string;
  currentStage?: string | null;
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
  isActive: boolean;
}

export interface DashboardSummary {
  total: number;
  pending: number;
  refused: number;
  soldToday: number;
  activeCall: boolean;
}
