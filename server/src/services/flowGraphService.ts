import { prisma } from "../db.js";
import { AppError } from "../middleware/errorHandler.js";
import { validateFlowGraph } from "../flow/graphValidation.js";
import { createDefaultStarterFlow } from "../flow/starterFlow.js";
import { linearFlowToGraph } from "../flow/linearToGraph.js";
import { parseCallFlow } from "./callFlowService.js";
import type { FlowGraph } from "../flow/graphTypes.js";

export async function getActiveFlowGraph(): Promise<FlowGraph | null> {
  const flow = await prisma.callFlow.findFirst({
    where: { isActive: true },
    orderBy: { version: "desc" },
  });
  if (!flow?.publishedGraphJson || flow.publishedGraphJson === "{}") return null;
  return JSON.parse(flow.publishedGraphJson) as FlowGraph;
}

export async function getDraftGraph(flowId: string): Promise<FlowGraph> {
  const flow = await prisma.callFlow.findUnique({ where: { id: flowId } });
  if (!flow) throw new AppError(404, "זרימת שיחה לא נמצאה");
  const json = flow.draftGraphJson !== "{}" ? flow.draftGraphJson : flow.publishedGraphJson;
  if (!json || json === "{}") {
    return createDefaultStarterFlow();
  }
  return JSON.parse(json) as FlowGraph;
}

export async function saveDraftGraph(flowId: string, graph: FlowGraph) {
  const flow = await prisma.callFlow.findUnique({ where: { id: flowId } });
  if (!flow) throw new AppError(404, "זרימת שיחה לא נמצאה");
  return prisma.callFlow.update({
    where: { id: flowId },
    data: { draftGraphJson: JSON.stringify(graph) },
  });
}

export async function publishFlowGraph(flowId: string) {
  const flow = await prisma.callFlow.findUnique({ where: { id: flowId } });
  if (!flow) throw new AppError(404, "זרימת שיחה לא נמצאה");

  const graph = JSON.parse(
    flow.draftGraphJson !== "{}" ? flow.draftGraphJson : flow.publishedGraphJson,
  ) as FlowGraph;
  const errors = validateFlowGraph(graph);
  if (errors.length > 0) {
    throw new AppError(400, errors.map((e) => e.messageHe).join("; "));
  }

  await prisma.callFlow.updateMany({ data: { isActive: false }, where: { isActive: true } });

  const version = flow.version + 1;
  return prisma.callFlow.create({
    data: {
      version,
      openingTemplate: flow.openingTemplate,
      stagesJson: flow.stagesJson,
      objectionsJson: flow.objectionsJson,
      draftGraphJson: JSON.stringify(graph),
      publishedGraphJson: JSON.stringify(graph),
      graphPublishedAt: new Date(),
      isActive: true,
    },
  });
}

export async function importLinearToGraph(flowId: string) {
  const flow = await prisma.callFlow.findUnique({ where: { id: flowId } });
  if (!flow) throw new AppError(404, "זרימת שיחה לא נמצאה");
  const parsed = parseCallFlow(flow);
  const graph = linearFlowToGraph(parsed);
  return saveDraftGraph(flowId, graph);
}

export async function ensureStarterGraphPublished(): Promise<void> {
  const active = await prisma.callFlow.findFirst({
    where: { isActive: true },
    orderBy: { version: "desc" },
  });
  if (!active) return;

  if (active.publishedGraphJson && active.publishedGraphJson !== "{}") return;

  const graph = createDefaultStarterFlow();
  await prisma.callFlow.update({
    where: { id: active.id },
    data: {
      draftGraphJson: JSON.stringify(graph),
      publishedGraphJson: JSON.stringify(graph),
      graphPublishedAt: new Date(),
    },
  });
}

export function getPublishedGraphForCall(flow: {
  publishedGraphJson: string;
  draftGraphJson: string;
}): FlowGraph | null {
  const json = flow.publishedGraphJson !== "{}" ? flow.publishedGraphJson : flow.draftGraphJson;
  if (!json || json === "{}") return null;
  return JSON.parse(json) as FlowGraph;
}
