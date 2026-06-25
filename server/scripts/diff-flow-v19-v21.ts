import { prisma } from "../src/db.js";
import { enhanceSigalGraph } from "../src/flow/sigalMiniFlow.js";
import { normalizeFlowGraph } from "../src/flow/graphFlowEngine.js";
import { validateFlowGraph } from "../src/flow/graphValidation.js";

const v19 = await prisma.callFlow.findFirst({ where: { version: 19 } });
const v21 = await prisma.callFlow.findFirst({ where: { version: 21 } });
if (!v19 || !v21) throw new Error("missing versions");

const g19 = JSON.parse(v19.publishedGraphJson);
const g21 = JSON.parse(v21.publishedGraphJson);

for (const id of ["speak_opening", "speak_tv", "speak_inet", "speak_hi"]) {
  const n19 = g19.nodes.find((n: { id: string }) => n.id === id);
  const n21 = g21.nodes.find((n: { id: string }) => n.id === id);
  console.log("\n====", id, "====");
  console.log("v19:", n19?.text ?? "(missing)");
  console.log("v21:", n21?.text ?? "(missing)");
}

console.log("\n=== v19 opening edges out ===");
console.log(g19.edges.filter((e: { source: string }) => e.source === "route_opening").map((e: { intentId?: string; target: string }) => `${e.intentId ?? "default"} -> ${e.target}`));

console.log("\n=== v21 opening edges out ===");
console.log(g21.edges.filter((e: { source: string }) => e.source === "route_opening").map((e: { intentId?: string; target: string }) => `${e.intentId ?? "default"} -> ${e.target}`));

const enhanced19 = enhanceSigalGraph(normalizeFlowGraph(g19));
console.log("\n=== v19 after enhance validation ===", validateFlowGraph(enhanced19).length, "errors");
const o19 = enhanced19.nodes.find((n) => n.id === "speak_opening");
console.log("opening after enhance:", o19?.type === "speak" ? o19.text.slice(0, 120) : "n/a");

await prisma.$disconnect();
