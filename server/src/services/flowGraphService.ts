import { prisma } from "../db.js";
import { AppError } from "../middleware/errorHandler.js";
import { validateFlowGraph } from "../flow/graphValidation.js";
import { createDefaultStarterFlow, isSigalFlowGraph, SIGAL_OPENING, SIGAL_QUALIFY, SOLD_GOODBYE } from "../flow/starterFlow.js";
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

const QA_REPLY_IDS = [
  "price_reply",
  "channel_reply",
  "packet_reply",
  "internet_reply",
  "router_reply",
  "options_reply",
] as const;

export function patchQaReplyEdges(graph: FlowGraph): FlowGraph {
  return {
    ...graph,
    edges: graph.edges.map((e) => {
      if (QA_REPLY_IDS.includes(e.source as (typeof QA_REPLY_IDS)[number]) && e.target === "close") {
        return { ...e, target: "listen_pitch" };
      }
      return e;
    }),
  };
}

export function patchSoldGoodbyeNode(graph: FlowGraph): FlowGraph {
  const nodes = graph.nodes.some((n) => n.id === "goodbye_sold")
    ? graph.nodes.map((n) =>
        n.id === "goodbye_sold" && n.type === "speak" ? { ...n, text: SOLD_GOODBYE } : n,
      )
    : [
        ...graph.nodes,
        {
          id: "goodbye_sold",
          type: "speak" as const,
          label: "פרידה לאחר עניין",
          text: SOLD_GOODBYE,
          useLlm: false,
          position: { x: 350, y: 1400 },
        },
      ];

  let edges = graph.edges.map((e) =>
    e.source === "route_close" && e.intentId === "agree_purchase" && e.target === "end_sold"
      ? { ...e, target: "goodbye_sold" }
      : e,
  );
  if (!edges.some((e) => e.source === "goodbye_sold" && e.target === "end_sold")) {
    edges = [...edges, { id: "e46", source: "goodbye_sold", target: "end_sold" }];
  }

  return { ...graph, nodes, edges };
}

export function patchSigalOpeningCopy(graph: FlowGraph): FlowGraph {
  return patchSoldGoodbyeNode(
    patchQaReplyEdges({
      ...graph,
      nodes: graph.nodes.map((n) => {
        if (n.id === "start" && n.type === "speak") return { ...n, text: SIGAL_OPENING };
        if (n.id === "qualify" && n.type === "speak") return { ...n, text: SIGAL_QUALIFY };
        return n;
      }),
    }),
  );
}

function graphNeedsSigalPatch(graph: FlowGraph): boolean {
  const start = graph.nodes.find((n) => n.id === "start" && n.type === "speak");
  const hasDealsOpening = Boolean(start?.type === "speak" && start.text.includes("מבצע"));
  const optionsToClose = graph.edges.some((e) => e.source === "options_reply" && e.target === "close");
  const agreeToEnd = graph.edges.some(
    (e) => e.source === "route_close" && e.intentId === "agree_purchase" && e.target === "end_sold",
  );
  return !isSigalFlowGraph(graph) || !hasDealsOpening || optionsToClose || agreeToEnd;
}

export async function migrateToSigalFlowIfNeeded(): Promise<void> {
  const active = await prisma.callFlow.findFirst({
    where: { isActive: true },
    orderBy: { version: "desc" },
  });
  if (!active) return;

  const json = active.publishedGraphJson !== "{}" ? active.publishedGraphJson : active.draftGraphJson;
  if (!json || json === "{}") {
    await ensureStarterGraphPublished();
    return;
  }

  const existing = JSON.parse(json) as FlowGraph;
  if (!graphNeedsSigalPatch(existing)) return;

  const graph = isSigalFlowGraph(existing)
    ? patchSigalOpeningCopy(existing)
    : createDefaultStarterFlow();
  const openingTemplate = SIGAL_OPENING.replace(/\{\{agent_name\}\}/g, "סיגל");

  await prisma.callFlow.update({
    where: { id: active.id },
    data: {
      openingTemplate,
      draftGraphJson: JSON.stringify(graph),
      publishedGraphJson: JSON.stringify(graph),
      graphPublishedAt: new Date(),
    },
  });
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
