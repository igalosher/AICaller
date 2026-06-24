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

const edge = engine.getNextAutoEdge(node.id);
if (!edge || edge.target !== "listen_opening") {
  console.error("Opening should link to listen_opening");
  process.exit(1);
}

engine.currentNodeId = edge.target;
engine.advanceFromListen();
const route = engine.getCurrentNode();
if (route?.id !== "route_opening") {
  console.error("Expected route_opening after listen, got", route?.id);
  process.exit(1);
}

const tvEdge = engine.advanceByClassification(
  { intentId: "greeting_ack", confidence: 1, entities: {}, classifier: "rule" },
  {},
);
if (tvEdge?.id !== "speak_tv") {
  console.error("Default opening route should reach speak_tv, got", tvEdge?.id);
  process.exit(1);
}

console.log("Sigal MiniFlow graph OK:", graph.nodes.length, "nodes,", graph.edges.length, "edges");
