import { prisma } from "../src/db.js";
import { getPublishedGraphForCall, patchActiveFlowEnhancements } from "../src/services/flowGraphService.js";
import { validateFlowGraph } from "../src/flow/graphValidation.js";
import { enhanceSigalGraph } from "../src/flow/sigalMiniFlow.js";
import { normalizeFlowGraph } from "../src/flow/graphFlowEngine.js";

await patchActiveFlowEnhancements();

const flow = await prisma.callFlow.findFirst({
  where: { isActive: true },
  orderBy: { version: "desc" },
});
if (!flow) {
  console.log("no flow");
} else {
  const raw = JSON.parse(flow.draftGraphJson || flow.publishedGraphJson) as import("../src/flow/graphTypes.js").FlowGraph;
  const enhanced = enhanceSigalGraph(normalizeFlowGraph(raw));
  const errors = validateFlowGraph(enhanced);
  console.log("validation errors:", errors.length);
  if (errors.length) console.log(errors.map((e) => e.messageHe).join("\n"));
  const orphans = [
    "listen_fiber_yes",
    "route_fiber_yes",
    "listen_summary",
    "route_summary",
  ];
  console.log(
    "orphan nodes in enhanced graph:",
    orphans.filter((id) => enhanced.nodes.some((n) => n.id === id)),
  );
}

await prisma.$disconnect();
