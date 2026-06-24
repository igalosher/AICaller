import type {
  CallFlowContext,
  StagedFlowDefinition,
  StagedStage,
} from "./stagedFlowTypes.js";

const PRODUCT_QA_INTENTS = new Set([
  "ask_channel",
  "ask_packet",
  "ask_internet",
  "ask_router_rental",
  "ask_options_compare",
  "price_objection",
]);

export class StagedFlowEngine {
  public lastSpokenText = "";

  constructor(
    public definition: StagedFlowDefinition,
    public currentStageId: string,
    public currentSubflowId: string | null,
    public context: CallFlowContext,
  ) {}

  getCurrentStage(): StagedStage | undefined {
    return this.findStage(this.currentStageId, this.currentSubflowId);
  }

  findStage(stageId: string, subflowId: string | null): StagedStage | undefined {
    if (subflowId) {
      return this.definition.subflows[subflowId]?.stages.find((s) => s.id === stageId);
    }
    return this.definition.stages.find((s) => s.id === stageId);
  }

  isProductQaIntent(intentId: string): boolean {
    return PRODUCT_QA_INTENTS.has(intentId);
  }

  isAdvanceIntent(stage: StagedStage, intentId: string): boolean {
    return (stage.advanceOn ?? []).includes(intentId);
  }

  resolveBranch(
    stage: StagedStage,
    intentId: string,
  ): { subflowId: string; stageId?: string } | null {
    const target = stage.branchOn?.[intentId];
    if (!target) return null;
    if (typeof target === "string") {
      const sub = this.definition.subflows[target];
      return { subflowId: target, stageId: sub?.stages[0]?.id };
    }
    return target;
  }

  enterSubflow(subflowId: string, stageId?: string): void {
    const sub = this.definition.subflows[subflowId];
    if (!sub?.stages.length) return;
    this.currentSubflowId = subflowId;
    this.currentStageId = stageId ?? sub.stages[0]!.id;
  }

  advanceLinear(stage: StagedStage): boolean {
    if (stage.mergeSubflow) {
      this.enterSubflow(stage.mergeSubflow, stage.mergeStageId);
      return true;
    }
    if (stage.nextStageId) {
      if (this.currentSubflowId) {
        const sub = this.definition.subflows[this.currentSubflowId];
        const inSubflow = sub?.stages.some((s) => s.id === stage.nextStageId);
        if (inSubflow) {
          this.currentStageId = stage.nextStageId;
          return true;
        }
        if (stage.mergeSubflow === undefined && stage.nextStageId) {
          // next stage may be in another subflow referenced by id
          for (const [sfId, sf] of Object.entries(this.definition.subflows)) {
            if (sf.stages.some((s) => s.id === stage.nextStageId)) {
              this.enterSubflow(sfId, stage.nextStageId);
              return true;
            }
          }
        }
      } else {
        this.currentStageId = stage.nextStageId;
        return true;
      }
    }
    if (this.currentSubflowId) {
      const sub = this.definition.subflows[this.currentSubflowId];
      const idx = sub?.stages.findIndex((s) => s.id === stage.id) ?? -1;
      const next = sub?.stages[idx + 1];
      if (next) {
        this.currentStageId = next.id;
        return true;
      }
    } else {
      const idx = this.definition.stages.findIndex((s) => s.id === stage.id);
      const next = this.definition.stages[idx + 1];
      if (next) {
        this.currentStageId = next.id;
        return true;
      }
    }
    return false;
  }

  shouldShowStage(stage: StagedStage): boolean {
    if (!stage.showIf) return true;
    if (stage.showIf === "fiber_available") return this.context.fiberAvailable === true;
    if (stage.showIf === "fiber_unavailable") return this.context.fiberAvailable === false;
    return true;
  }

  applyEntityContext(intentId: string, entities: Record<string, unknown>): void {
    if (intentId === "provide_tv_count" && entities.tv_count != null) {
      this.context.tvCount = Number(entities.tv_count);
    }
    if (intentId === "provide_address" && entities.address) {
      this.context.address = String(entities.address);
    }
    if (intentId.startsWith("select_speed_")) {
      const mbps = Number(intentId.replace("select_speed_", ""));
      if (!Number.isNaN(mbps)) this.context.selectedSpeedMbps = mbps;
    }
    if (intentId.startsWith("provider_")) {
      this.context.currentProvider = intentId.replace("provider_", "");
    }
    if (intentId === "select_addons") {
      this.context.addonsSummary = "תוספות נבחרו";
    }
    if (intentId === "provide_current_price" && entities.monthly_price != null) {
      this.context.currentPrice = Number(entities.monthly_price);
    }
    if (this.context.tvCount && this.context.tvCount >= 1) {
      this.context.packageType = "חבילת טריפל";
    } else {
      this.context.packageType = "חבילת דאבל";
    }
    const base = this.context.selectedSpeedMbps
      ? this.context.selectedSpeedMbps >= 300
        ? 149
        : 129
      : 119;
    this.context.packagePrice = base;
    this.context.finalPrice = base + (this.context.addonsSummary ? 20 : 0);
  }
}

export function createStagedEngine(
  definition: StagedFlowDefinition,
  startStageId?: string,
  subflowId?: string | null,
  context?: CallFlowContext,
): StagedFlowEngine {
  return new StagedFlowEngine(
    definition,
    startStageId ?? definition.stages[0]?.id ?? "opening",
    subflowId ?? null,
    context ?? {},
  );
}
