import { prisma } from "../src/db.js";
import { enhanceSigalGraph } from "../src/flow/sigalMiniFlow.js";
import { normalizeFlowGraph } from "../src/flow/graphFlowEngine.js";
import { validateFlowGraph } from "../src/flow/graphValidation.js";

const v19 = await prisma.callFlow.findFirst({ where: { version: 19 } });
const v21 = await prisma.callFlow.findFirst({ where: { version: 21 } });
const g19 = JSON.parse(v19!.publishedGraphJson);
const g21 = JSON.parse(v21!.publishedGraphJson);

const tvEdges19 = g19.edges.filter(
  (e: { source: string; target: string }) =>
    e.source.includes("tv") || e.target.includes("tv") || e.source.includes("opening") || e.target.includes("opening"),
);
console.log("v19 tv/opening edges:");
for (const e of tvEdges19) {
  console.log(`  ${e.source} -> ${e.target} ${e.intentId ?? (e.isDefault ? "default" : "")}`);
}

const tvEdges21 = g21.edges.filter(
  (e: { source: string; target: string }) =>
    e.source.includes("tv") || e.target.includes("tv") || e.source.includes("opening") || e.target.includes("opening"),
);
console.log("\nv21 tv/opening edges:");
for (const e of tvEdges21) {
  console.log(`  ${e.source} -> ${e.target} ${e.intentId ?? (e.isDefault ? "default" : "")}`);
}

const enhanced19 = enhanceSigalGraph(normalizeFlowGraph(g19));
const errs = validateFlowGraph(enhanced19);
console.log("\nv19 after enhance errors:", errs.length, errs.slice(0, 5));

const opening19 = enhanced19.nodes.find((n) => n.id === "speak_opening");
console.log("\nopening preserved:", opening19?.type === "speak" ? opening19.text.includes("סִגׇּל") : false);

await prisma.$disconnect();
