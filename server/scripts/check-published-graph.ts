import { prisma } from "../src/db.js";
import { enhanceSigalGraph } from "../src/flow/sigalMiniFlow.js";
import { getListenScopedIntentIds, isMainPathAnswer, shouldInterruptQa } from "../src/flow/graphFlowRuntime.js";

const flow = await prisma.callFlow.findFirst({
  where: { isActive: true },
  orderBy: { version: "desc" },
});
if (!flow) {
  console.log("no flow");
} else {
  const raw = JSON.parse(flow.publishedGraphJson) as { edges: { source: string; intentId?: string }[]; sideFlows?: unknown };
  const graph = enhanceSigalGraph(raw as import("../src/flow/graphTypes.js").FlowGraph);
  const edges = graph.edges.filter((e) => e.source === "route_inet");
  console.log("route_inet edges:", edges.map((e) => ({ intentId: e.intentId, target: e.target })));
  console.log("sideFlows:", graph.sideFlows);
  const cls = { intentId: "internet_regular", confidence: 0.9 };
  console.log("scoped:", getListenScopedIntentIds(graph, "listen_inet"));
  console.log("isMain:", isMainPathAnswer(graph, "listen_inet", cls, {}));
  console.log("interruptQa:", shouldInterruptQa(graph, "listen_inet", cls, {}));
}
await prisma.$disconnect();
