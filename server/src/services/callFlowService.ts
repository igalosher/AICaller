import { prisma } from "../db.js";
import { AppError } from "../middleware/errorHandler.js";
import { resolveTemplate } from "../utils/template.js";

export interface FlowStage {
  id: string;
  prompt: string;
  next: string;
}

export interface CallFlowData {
  openingTemplate: string;
  stages: FlowStage[];
  objections: Record<string, string>;
}

export class CallFlowEngine {
  constructor(
    private stages: FlowStage[],
    private objections: Record<string, string>,
    public currentStageId: string,
    private spokenOffsets: Record<string, number> = {},
  ) {}

  getCurrentStage(): FlowStage | undefined {
    return this.stages.find((s) => s.id === this.currentStageId);
  }

  advance(): FlowStage | undefined {
    const current = this.getCurrentStage();
    if (!current?.next) return current;
    this.currentStageId = current.next;
    return this.getCurrentStage();
  }

  routeObjection(key: string): string | undefined {
    return this.objections[key];
  }

  markSpokenOffset(stageId: string, offset: number): void {
    this.spokenOffsets[stageId] = offset;
  }

  getSpokenOffset(stageId: string): number {
    return this.spokenOffsets[stageId] ?? 0;
  }
}

export async function getActiveCallFlow() {
  const flow = await prisma.callFlow.findFirst({
    where: { isActive: true },
    orderBy: { version: "desc" },
  });
  if (!flow) throw new AppError(404, "זרימת שיחה פעילה לא נמצאה");
  return flow;
}

export async function listCallFlows() {
  return prisma.callFlow.findMany({ orderBy: [{ isActive: "desc" }, { version: "desc" }] });
}

export async function createCallFlowVersion(data: CallFlowData) {
  const latest = await prisma.callFlow.findFirst({ orderBy: { version: "desc" } });
  const version = (latest?.version ?? 0) + 1;
  await prisma.callFlow.updateMany({ data: { isActive: false }, where: { isActive: true } });
  return prisma.callFlow.create({
    data: {
      version,
      openingTemplate: data.openingTemplate,
      stagesJson: JSON.stringify(data.stages),
      objectionsJson: JSON.stringify(data.objections),
      isActive: true,
    },
  });
}

export async function updateCallFlow(id: string, data: CallFlowData) {
  const existing = await prisma.callFlow.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "זרימת שיחה לא נמצאה");
  return createCallFlowVersion(data);
}

export function parseCallFlow(flow: {
  openingTemplate: string;
  stagesJson: string;
  objectionsJson: string;
}): CallFlowData {
  return {
    openingTemplate: flow.openingTemplate,
    stages: JSON.parse(flow.stagesJson) as FlowStage[],
    objections: JSON.parse(flow.objectionsJson) as Record<string, string>,
  };
}

export function previewOpeningLine(
  openingTemplate: string,
  customerFullName = "ישראל ישראלי",
): string {
  return resolveTemplate(openingTemplate, { customer_name: customerFullName });
}

export function createEngineFromFlow(
  flow: { stagesJson: string; objectionsJson: string },
  startStageId?: string,
): CallFlowEngine {
  const stages = JSON.parse(flow.stagesJson) as FlowStage[];
  const objections = JSON.parse(flow.objectionsJson) as Record<string, string>;
  return new CallFlowEngine(stages, objections, startStageId ?? stages[0]?.id ?? "greeting");
}
