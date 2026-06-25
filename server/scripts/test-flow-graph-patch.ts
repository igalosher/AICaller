/**
 * Flow graph patch + scope guard tests.
 * Run: npx tsx scripts/test-flow-graph-patch.ts
 */
import assert from "node:assert/strict";
import { createSigalMiniFlowGraph } from "../src/flow/sigalMiniFlow.js";
import { applyFlowGraphPatch } from "../src/flow/flowGraphPatch.js";
import { isObviouslyOffTopic } from "../src/services/flowAiEditService.js";
import { enhanceSigalGraph } from "../src/flow/sigalMiniFlow.js";
import { normalizeFlowGraph } from "../src/flow/graphFlowEngine.js";
import { validateFlowGraph } from "../src/flow/graphValidation.js";

const graph = enhanceSigalGraph(normalizeFlowGraph(createSigalMiniFlowGraph()));

const textPatch = applyFlowGraphPatch(graph, {
  operations: [{ op: "updateSpeakText", nodeId: "speak_opening", text: "שלום, כמה טלוויזיות?" }],
  summaryHe: "עודכן פתיחה",
});
assert.equal(textPatch.affectedNodeIds[0], "speak_opening");
assert.ok(
  textPatch.graph.nodes.find((n) => n.id === "speak_opening")?.type === "speak" &&
    (textPatch.graph.nodes.find((n) => n.id === "speak_opening") as { text: string }).text.includes("טלוויזיות"),
);
console.log("✓ updateSpeakText");

const addPatch = applyFlowGraphPatch(graph, {
  operations: [
    {
      op: "addNode",
      node: {
        id: "speak_test_extra",
        type: "speak",
        label: "בדיקה",
        text: "שאלת בדיקה",
        position: { x: 100, y: 100 },
      },
    },
    {
      op: "addEdge",
      edge: { id: "e_test_extra", source: "speak_opening", target: "speak_test_extra" },
    },
  ],
});
assert.ok(addPatch.graph.nodes.some((n) => n.id === "speak_test_extra"));
console.log("✓ addNode + addEdge");

const rewire = applyFlowGraphPatch(graph, {
  operations: [
    {
      op: "updateEdge",
      id: graph.edges.find((e) => e.source === "route_tv" && e.intentId === "provide_tv_count")!.id,
      patch: { target: "speak_inet" },
    },
  ],
});
const edge = rewire.graph.edges.find((e) => e.source === "route_tv" && e.intentId === "provide_tv_count");
assert.equal(edge?.target, "speak_inet");
console.log("✓ rewire edge");

assert.ok(isObviouslyOffTopic("מה מזג האוויר היום?"));
assert.ok(!isObviouslyOffTopic("שני את ניסוח שאלת המחיר"));
console.log("✓ off-topic guard");

const validated = validateFlowGraph(textPatch.graph);
assert.ok(Array.isArray(validated));
console.log("\nFlow graph patch tests passed.");
