/**
 * Smoke test for Sigal MiniFlow graph structure (no DB).
 * Run: npx tsx scripts/test-sigal-miniflow.ts
 */
import { createSigalMiniFlowGraph, isSigalMiniFlowGraph } from "../src/flow/sigalMiniFlow.js";
import { createEngineFromGraph } from "../src/flow/graphFlowEngine.js";
import { validateFlowGraph } from "../src/flow/graphValidation.js";

const graph = createSigalMiniFlowGraph();
const errors = validateFlowGraph(graph);
if (errors.length) {
  console.error("Validation errors:", errors);
  process.exit(1);
}
if (!isSigalMiniFlowGraph(graph)) {
  console.error("Graph not recognized as Sigal MiniFlow");
  process.exit(1);
}

const engine = createEngineFromGraph(JSON.stringify(graph));
let node = engine.getCurrentNode();
if (node?.id !== "speak_opening") {
  console.error("Expected speak_opening, got", node?.id);
  process.exit(1);
}

const opening = graph.nodes.find((n) => n.id === "speak_opening");
if (opening?.type !== "speak" || !opening.text.includes("טלויזיות")) {
  console.error("Opening should include the TV count question");
  process.exit(1);
}

const edge = engine.getNextAutoEdge(node.id);
if (!edge || edge.target !== "listen_tv") {
  console.error("Opening should link to listen_tv, got", edge?.target);
  process.exit(1);
}

engine.currentNodeId = edge.target;
engine.advanceFromListen();
const route = engine.getCurrentNode();
if (route?.id !== "route_tv") {
  console.error("Expected route_tv after listen, got", route?.id);
  process.exit(1);
}

const inetNode = engine.advanceByClassification(
  { intentId: "provide_tv_count", confidence: 1, entities: { tv_count: 2 }, classifier: "rule" },
  {},
);
if (inetNode?.id !== "speak_inet") {
  console.error("TV answer should reach speak_inet, got", inetNode?.id);
  process.exit(1);
}

console.log("Sigal MiniFlow graph OK:", graph.nodes.length, "nodes,", graph.edges.length, "edges");
