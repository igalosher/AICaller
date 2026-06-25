/**
 * Restore active flow content from v19 (user-intended ניקוד + opening/TV/inet text)
 * while applying current graph enhancements (auto-advance, bindings, etc.).
 * Run: npx tsx scripts/restore-flow-from-v19.ts
 */
import { prisma } from "../src/db.js";
import { enhanceSigalGraph } from "../src/flow/sigalMiniFlow.js";
import { normalizeFlowGraph } from "../src/flow/graphFlowEngine.js";
import { validateFlowGraph } from "../src/flow/graphValidation.js";

const v19 = await prisma.callFlow.findFirst({ where: { version: 19 } });
const active = await prisma.callFlow.findFirst({
  where: { isActive: true },
  orderBy: { version: "desc" },
});
if (!v19?.publishedGraphJson) throw new Error("v19 published graph missing");
if (!active) throw new Error("no active flow");

const restored = enhanceSigalGraph(
  normalizeFlowGraph(JSON.parse(v19.publishedGraphJson)),
);
const errors = validateFlowGraph(restored);
if (errors.length > 0) {
  console.error("Validation errors:", errors);
  process.exit(1);
}

const opening = restored.nodes.find((n) => n.id === "speak_opening");
const inet = restored.nodes.find((n) => n.id === "speak_inet");
const nextJson = JSON.stringify(restored);

await prisma.callFlow.update({
  where: { id: active.id },
  data: {
    draftGraphJson: nextJson,
    publishedGraphJson: nextJson,
    openingTemplate: opening?.type === "speak" ? opening.text : active.openingTemplate,
    graphPublishedAt: new Date(),
  },
});

console.log("Restored active flow from v19 + enhancements");
console.log("nodes:", restored.nodes.length, "edges:", restored.edges.length);
console.log(
  "opening has nikud:",
  opening?.type === "speak" && opening.text.includes("סִגׇּל"),
);
console.log(
  "opening has TV question:",
  opening?.type === "speak" && opening.text.includes("טלויזיות"),
);
console.log("inet:", inet?.type === "speak" ? inet.text.slice(0, 80) : "n/a");
console.log("validation errors:", errors.length);

await prisma.$disconnect();
