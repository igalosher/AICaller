import { prisma } from "../src/db.js";
import { createSigalMiniFlowGraph, isSigalMiniFlowGraph, STAGED_OPENING } from "../src/flow/sigalMiniFlow.js";
import type { FlowGraph } from "../src/flow/graphTypes.js";
import { validateFlowGraph } from "../src/flow/graphValidation.js";

const active = await prisma.callFlow.findFirst({
  where: { isActive: true },
  orderBy: { version: "desc" },
});
if (!active) {
  console.error("No active call flow");
  process.exit(1);
}

const published = JSON.parse(active.publishedGraphJson || "{}") as FlowGraph;
const draft = JSON.parse(active.draftGraphJson || "{}") as FlowGraph;

console.log(
  "Before:",
  `published ${published.nodes?.length ?? 0} nodes,`,
  `draft ${draft.nodes?.length ?? 0} nodes`,
);

const template = createSigalMiniFlowGraph();
const publishedValid =
  isSigalMiniFlowGraph(published) &&
  (published.nodes?.length ?? 0) > 10 &&
  validateFlowGraph(published).length === 0;

const graph = publishedValid ? published : template;

await prisma.callFlow.update({
  where: { id: active.id },
  data: {
    openingTemplate: STAGED_OPENING,
    stagesJson: "[]",
    draftGraphJson: JSON.stringify(graph),
    publishedGraphJson: JSON.stringify(graph),
    graphPublishedAt: new Date(),
  },
});

console.log("Restored:", graph.nodes.length, "nodes,", graph.edges.length, "edges");

await prisma.$disconnect();
