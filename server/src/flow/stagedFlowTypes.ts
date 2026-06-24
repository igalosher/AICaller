export interface StagedListenConfig {
  silenceAdvanceSec?: number;
}

export interface StagedStage {
  id: string;
  type?: "speak" | "system";
  speakText?: string;
  action?: "fiber_availability_lookup";
  listen?: StagedListenConfig;
  /** When true, speak this stage and wait for customer input before advancing. */
  waitForAnswer?: boolean;
  advanceOn?: string[];
  branchOn?: Record<string, string | { subflowId: string; stageId?: string }>;
  showIf?: "fiber_available" | "fiber_unavailable";
  nextStageId?: string;
  mergeSubflow?: string;
  mergeStageId?: string;
  interruptible?: boolean;
  outcome?: string;
  contactStatus?: string;
  endCall?: boolean;
}

export interface StagedSubflow {
  stages: StagedStage[];
}

export interface StagedFlowDefinition {
  flowType: "staged";
  stages: StagedStage[];
  subflows: Record<string, StagedSubflow>;
}

export interface CallFlowContext {
  tvCount?: number;
  address?: string;
  fiberAvailable?: boolean;
  selectedSpeedMbps?: number;
  currentProvider?: string;
  currentPrice?: number;
  packageType?: string;
  packagePrice?: number;
  finalPrice?: number;
  addonsSummary?: string;
}

export function parseStagedFlow(stagesJson: string): StagedFlowDefinition | null {
  try {
    const parsed = JSON.parse(stagesJson) as StagedFlowDefinition | unknown[];
    if (Array.isArray(parsed)) return null;
    if (parsed && typeof parsed === "object" && (parsed as StagedFlowDefinition).flowType === "staged") {
      return parsed as StagedFlowDefinition;
    }
    return null;
  } catch {
    return null;
  }
}
