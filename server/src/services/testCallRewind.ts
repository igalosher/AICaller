import { prisma } from "../db.js";
import { AppError } from "../middleware/errorHandler.js";
import type { GraphFlowEngine } from "../flow/graphFlowEngine.js";
import { GraphFlowEngine as GraphFlowEngineClass } from "../flow/graphFlowEngine.js";
import {
  getListenCheckpoint,
  parseGraphContext,
  serializeGraphContext,
  speakNodeForListen,
  type GraphCallContext,
  type TestRewindSnapshot,
} from "../flow/graphFlowRuntime.js";
import type { FlowGraph } from "../flow/graphTypes.js";
import { mergeTemplateVars, resolveTemplate } from "../utils/template.js";
import { flowVariablesForTemplate } from "../flow/variableBinding.js";
import { getActiveCallFlow } from "./callFlowService.js";
import { getGraphForTestCall } from "./flowGraphService.js";
import type { ContactSex } from "@prisma/client";

function isTestCallExternalId(externalCallId: string | null | undefined): boolean {
  return Boolean(externalCallId?.startsWith("test-"));
}

function templateVars(firstName: string, familyName: string, sex: ContactSex = "male") {
  return {
    firstName,
    familyName,
    customerName: `${firstName} ${familyName}`.trim(),
    sex,
  };
}

function resolveNodeAfterGraphUpdate(
  graph: FlowGraph,
  snapshot: TestRewindSnapshot,
  speakNodeId?: string | null,
): string {
  if (graph.nodes.some((n) => n.id === snapshot.currentNodeId)) {
    return snapshot.currentNodeId;
  }
  if (speakNodeId && graph.nodes.some((n) => n.id === speakNodeId)) {
    for (const edge of graph.edges) {
      if (edge.source === speakNodeId) {
        const target = graph.nodes.find((n) => n.id === edge.target);
        if (target?.type === "listen" || target?.type === "intent_route") {
          return target.id;
        }
      }
    }
    const listenGuess = speakNodeId.replace(/^speak_/, "listen_");
    if (graph.nodes.some((n) => n.id === listenGuess)) return listenGuess;
  }
  const checkpoint = snapshot.mainCheckpoint?.listenNodeId;
  if (checkpoint && graph.nodes.some((n) => n.id === checkpoint)) {
    return checkpoint;
  }
  return graph.startNodeId;
}

export async function syncTestCallGraphEngine(
  engine: GraphFlowEngine,
  preferredNodeId: string,
): Promise<FlowGraph | null> {
  const flow = await getActiveCallFlow();
  const graph = getGraphForTestCall(flow);
  if (!graph) return null;
  const nodeId = resolveNodeAfterGraphUpdate(
    graph,
    { currentNodeId: preferredNodeId, lastTranscriptSegmentId: "" },
    undefined,
  );
  engine.replaceGraph(graph, nodeId);
  return graph;
}

export async function appendTestRewindSnapshot(
  callId: string,
  externalCallId: string | null | undefined,
  engine: GraphFlowEngine,
  ctx: GraphCallContext,
  segmentId: string,
): Promise<void> {
  if (!isTestCallExternalId(externalCallId)) return;

  const current = await prisma.call.findUnique({
    where: { id: callId },
    select: { contextJson: true },
  });
  const parsed = parseGraphContext(current?.contextJson ?? "{}");
  const stack = parsed.testRewindStack ?? [];
  stack.push({
    currentNodeId: engine.currentNodeId,
    variables: ctx.variables ? structuredClone(ctx.variables) : {},
    lastSpokenText: ctx.lastSpokenText,
    mainCheckpoint: ctx.mainCheckpoint ? { ...ctx.mainCheckpoint } : undefined,
    lastTranscriptSegmentId: segmentId,
  });

  await prisma.call.update({
    where: { id: callId },
    data: {
      contextJson: serializeGraphContext({
        ...parsed,
        ...ctx,
        testRewindStack: stack,
      }),
    },
  });
}

export async function canRewindTestCall(callId: string): Promise<boolean> {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    select: { externalCallId: true, contextJson: true, status: true },
  });
  if (!call || call.status !== "connected" || !isTestCallExternalId(call.externalCallId)) {
    return false;
  }
  const stack = parseGraphContext(call.contextJson).testRewindStack ?? [];
  return stack.length > 1;
}

export type TestCallRewindCoreResult = {
  sayText: string;
  flowNodeId?: string;
  currentNodeId: string;
  engine: GraphFlowEngine;
  restoredCtx: GraphCallContext;
};

export async function computeTestCallRewind(callId: string): Promise<TestCallRewindCoreResult> {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { contact: true },
  });
  if (!call?.contact) throw new AppError(404, "שיחה לא נמצאה");
  if (!isTestCallExternalId(call.externalCallId)) {
    throw new AppError(400, "חזרה לשלב קודם זמינה רק בשיחת טסט");
  }
  if (call.status !== "connected") {
    throw new AppError(400, "השיחה אינה פעילה");
  }

  const ctx = parseGraphContext(call.contextJson);
  const stack = [...(ctx.testRewindStack ?? [])];
  if (stack.length <= 1) {
    throw new AppError(400, "אין שלב AI קודם לחזור אליו");
  }

  stack.pop();
  const target = stack[stack.length - 1]!;

  const segments = await prisma.callTranscriptSegment.findMany({
    where: { callId },
    orderBy: { timestamp: "asc" },
  });
  const cutAt = segments.findIndex((s) => s.id === target.lastTranscriptSegmentId);
  if (cutAt < 0) throw new AppError(400, "לא ניתן לשחזר — תמליל השיחה השתנה");

  const anchorSegment = segments[cutAt]!;
  const toDelete = segments.slice(cutAt + 1);
  if (toDelete.length > 0) {
    await prisma.callTranscriptSegment.deleteMany({
      where: { id: { in: toDelete.map((s) => s.id) } },
    });
  }

  const flow = await getActiveCallFlow();
  const graph = getGraphForTestCall(flow);
  if (!graph) throw new AppError(400, "אין גרף זרימה פעיל");

  const nodeId = resolveNodeAfterGraphUpdate(graph, target, anchorSegment.flowNodeId);
  const engine = new GraphFlowEngineClass(graph, nodeId);

  const restoredCtx: GraphCallContext = {
    variables: target.variables ? structuredClone(target.variables) : {},
    lastSpokenText: target.lastSpokenText,
    mainCheckpoint: target.mainCheckpoint ? { ...target.mainCheckpoint } : undefined,
    testRewindStack: stack,
  };

  const listenId = getListenCheckpoint(engine);
  const speakNode = listenId ? speakNodeForListen(engine, listenId) : undefined;
  const vars = mergeTemplateVars(
    templateVars(call.contact.firstName, call.contact.familyName, call.contact.sex),
    flowVariablesForTemplate(restoredCtx.variables ?? {}),
  );
  const sayText =
    (speakNode?.type === "speak" && speakNode.text
      ? resolveTemplate(speakNode.text, vars)
      : "") ||
    restoredCtx.lastSpokenText ||
    "נחזור לשלב הקודם.";

  restoredCtx.lastSpokenText = sayText;

  await prisma.call.update({
    where: { id: callId },
    data: {
      flowVersionId: flow.id,
      currentNodeId: engine.currentNodeId,
      currentStage: engine.currentNodeId,
      contextJson: serializeGraphContext(restoredCtx),
    },
  });

  return {
    sayText,
    flowNodeId: speakNode?.id ?? anchorSegment.flowNodeId ?? undefined,
    currentNodeId: engine.currentNodeId,
    engine,
    restoredCtx,
  };
}
