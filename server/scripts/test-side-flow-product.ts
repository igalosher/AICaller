/**
 * Product Q&A side flow runtime tests.
 * Run: npx tsx scripts/test-side-flow-product.ts
 */
import assert from "node:assert/strict";
import { createSigalMiniFlowGraph, enhanceSigalGraph, patchSigalProductSideFlows } from "../src/flow/sigalMiniFlow.js";
import { normalizeFlowGraph } from "../src/flow/graphFlowEngine.js";
import { validateFlowGraph } from "../src/flow/graphValidation.js";
import {
  collectSideFlowSubgraphNodeIds,
  isSideFlowExitIntent,
  shouldEnterSideFlow,
  sideFlowNodeIds,
} from "../src/flow/sideFlowRuntime.js";
import { findSideFlow } from "../src/flow/graphFlowRuntime.js";

const graph = patchSigalProductSideFlows(
  enhanceSigalGraph(normalizeFlowGraph(createSigalMiniFlowGraph())),
);

assert.ok(findSideFlow(graph, "ask_packet"), "ask_packet side flow exists");
assert.ok(findSideFlow(graph, "ask_channel"), "ask_channel side flow exists");
assert.equal(
  findSideFlow(graph, "ask_packet")?.entryNodeId,
  findSideFlow(graph, "ask_channel")?.entryNodeId,
  "product intents share entry",
);

const subgraph = collectSideFlowSubgraphNodeIds(graph, "side_product_qa_speak");
assert.ok(subgraph.has("side_product_qa_speak"), "subgraph is entry speak only");
assert.equal(subgraph.size, 1, "single-turn: no listen loop in subgraph");

const speak = graph.nodes.find((n) => n.id === "side_product_qa_speak");
assert.ok(speak?.type === "speak" && speak.useLlm, "entry speak uses LLM");
assert.ok(speak?.type === "speak" && speak.returnsToMain, "entry speak returns to main after answer");

assert.ok(
  shouldEnterSideFlow(graph, "listen_tv", { intentId: "ask_packet", confidence: 0.9 }, {}),
  "product question enters side flow at listen",
);
assert.ok(
  !shouldEnterSideFlow(graph, "listen_tv", { intentId: "provide_tv_count", confidence: 0.9 }, {}),
  "main-path answer does not enter side flow",
);

assert.ok(isSideFlowExitIntent("greeting_ack"));
assert.ok(!isSideFlowExitIntent("ask_packet"));

const errors = validateFlowGraph(graph);
assert.equal(errors.length, 0, `graph validates: ${errors.map((e) => e.messageHe).join("; ")}`);

assert.ok(sideFlowNodeIds(graph).has("side_product_qa_speak"), "reachability exempt includes entry speak");

console.log("✓ product side flow graph");
console.log("\nProduct side flow tests passed.");
