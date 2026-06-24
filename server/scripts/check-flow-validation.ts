import { prisma } from "../src/db.js";
import { validateFlowGraph } from "../src/flow/graphValidation.js";
import { getDraftGraph } from "../src/services/flowGraphService.js";

const f = await prisma.callFlow.findFirst({
  where: { isActive: true },
  orderBy: { version: "desc" },
});
if (!f) {
  console.log("no flow");
  process.exit(1);
}
const g = await getDraftGraph(f.id);
const pub = JSON.parse(f.publishedGraphJson) as typeof g;
console.log(
  "intent edges — published:",
  pub.edges.filter((e) => e.intentId).length,
  "draft:",
  g.edges.filter((e) => e.intentId).length,
);
const err = validateFlowGraph(g);
console.log("nodes", g.nodes.length, "edges", g.edges.length, "errors", err.length);
for (const e of err.slice(0, 8)) console.log("-", e.messageHe);
await prisma.$disconnect();
