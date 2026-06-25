import { prisma } from "../db.js";
import { AppError } from "../middleware/errorHandler.js";
import { validateFlowGraph } from "../flow/graphValidation.js";
import { createSigalMiniFlowGraph, enhanceSigalGraph, isSigalMiniFlowGraph, STAGED_OPENING } from "../flow/sigalMiniFlow.js";
import { normalizeFlowGraph } from "../flow/graphFlowEngine.js";
import {
  SIGAL_OPENING,
  SIGAL_QUALIFY,
  SOLD_GOODBYE,
} from "../flow/starterFlow.js";
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

  const published =
    flow.publishedGraphJson && flow.publishedGraphJson !== "{}"
      ? (JSON.parse(flow.publishedGraphJson) as FlowGraph)
      : null;
  const draftJson = flow.draftGraphJson !== "{}" ? flow.draftGraphJson : null;
  const draft = draftJson ? (JSON.parse(draftJson) as FlowGraph) : null;

  if (draft && published && isSigalMiniFlowGraph(published)) {
    const draftLooksTruncated =
      (draft.nodes?.length ?? 0) < 10 && (published.nodes?.length ?? 0) >= 10;
    const publishedIntentEdges = published.edges.filter((e) => e.intentId).length;
    const draftIntentEdges = draft.edges.filter((e) => e.intentId).length;
    const draftLostRouting = publishedIntentEdges >= 10 && draftIntentEdges < publishedIntentEdges / 2;
    if (draftLooksTruncated || draftLostRouting) return published;
  }

  if (draft) return enhanceSigalGraph(normalizeFlowGraph(draft));
  if (published) return enhanceSigalGraph(normalizeFlowGraph(published));
  return createSigalMiniFlowGraph();
}

export async function saveDraftGraph(flowId: string, graph: FlowGraph) {
  const flow = await prisma.callFlow.findUnique({ where: { id: flowId } });
  if (!flow) throw new AppError(404, "זרימת שיחה לא נמצאה");
  const enhanced = enhanceSigalGraph(normalizeFlowGraph(graph));
  await prisma.callFlow.update({
    where: { id: flowId },
    data: { draftGraphJson: JSON.stringify(enhanced) },
  });
  return enhanced;
}

export async function publishFlowGraph(flowId: string) {
  const flow = await prisma.callFlow.findUnique({ where: { id: flowId } });
  if (!flow) throw new AppError(404, "זרימת שיחה לא נמצאה");

  const raw = JSON.parse(
    flow.draftGraphJson !== "{}" ? flow.draftGraphJson : flow.publishedGraphJson,
  ) as FlowGraph;
  const graph = enhanceSigalGraph(normalizeFlowGraph(raw));
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

export async function migrateToSigalMiniFlowIfNeeded(): Promise<void> {
  const active = await prisma.callFlow.findFirst({
    where: { isActive: true },
    orderBy: { version: "desc" },
  });
  if (!active) return;

  const json = active.publishedGraphJson !== "{}" ? active.publishedGraphJson : active.draftGraphJson;
  if (json && json !== "{}") {
    const existing = JSON.parse(json) as FlowGraph;
    const validMini =
      isSigalMiniFlowGraph(existing) && validateFlowGraph(existing).length === 0;
    if (validMini) {
      await patchActiveFlowEnhancements();
      return;
    }
  }

  const graph = createSigalMiniFlowGraph();
  await prisma.callFlow.update({
    where: { id: active.id },
    data: {
      openingTemplate: STAGED_OPENING,
      stagesJson: "[]",
      publishedGraphJson: JSON.stringify(graph),
      draftGraphJson: JSON.stringify(graph),
      graphPublishedAt: new Date(),
    },
  });
}

/** Re-apply graph enhancements (auto-advance speaks, bindings, etc.) to the active published flow. */
export async function patchActiveFlowEnhancements(): Promise<void> {
  const active = await prisma.callFlow.findFirst({
    where: { isActive: true },
    orderBy: { version: "desc" },
  });
  if (!active) return;

  const raw =
    active.publishedGraphJson !== "{}" ? active.publishedGraphJson : active.draftGraphJson;
  if (!raw || raw === "{}") return;

  const parsed = JSON.parse(raw) as FlowGraph;
  if (!isSigalMiniFlowGraph(parsed)) return;

  const enhanced = enhanceSigalGraph(normalizeFlowGraph(parsed));
  const nextJson = JSON.stringify(enhanced);
  if (nextJson === active.draftGraphJson && nextJson === active.publishedGraphJson) return;

  await prisma.callFlow.update({
    where: { id: active.id },
    data: {
      draftGraphJson: nextJson,
      publishedGraphJson: nextJson,
    },
  });
}

/** @deprecated use migrateToSigalMiniFlowIfNeeded */
export async function migrateToStagedFlowIfNeeded(): Promise<void> {
  return migrateToSigalMiniFlowIfNeeded();
}

export async function migrateToSigalFlowIfNeeded(): Promise<void> {
  return migrateToSigalMiniFlowIfNeeded();
}

export async function ensureStarterGraphPublished(): Promise<void> {
  const active = await prisma.callFlow.findFirst({
    where: { isActive: true },
    orderBy: { version: "desc" },
  });
  if (!active) return;

  if (active.publishedGraphJson && active.publishedGraphJson !== "{}") return;

  const graph = createSigalMiniFlowGraph();
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
  return enhanceSigalGraph(JSON.parse(json) as FlowGraph);
}

/** Test calls prefer the latest draft graph so flow-builder edits apply without publish. */
export function getGraphForTestCall(flow: {
  publishedGraphJson: string;
  draftGraphJson: string;
}): FlowGraph | null {
  const json =
    flow.draftGraphJson && flow.draftGraphJson !== "{}"
      ? flow.draftGraphJson
      : flow.publishedGraphJson !== "{}"
        ? flow.publishedGraphJson
        : null;
  if (!json || json === "{}") return null;
  return enhanceSigalGraph(JSON.parse(json) as FlowGraph);
}
