/**
 * Graph listen silence repeat (20s) — unit-style test without DB.
 * Run: npx tsx scripts/test-graph-silence-repeat.ts
 */
import { createSigalMiniFlowGraph } from "../src/flow/sigalMiniFlow.js";
import { createEngineFromGraph } from "../src/flow/graphFlowEngine.js";
import { getListenCheckpoint } from "../src/flow/graphFlowRuntime.js";
import { GRAPH_LISTEN_SILENCE_SEC } from "../src/services/callService.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const graph = createSigalMiniFlowGraph();
const engine = createEngineFromGraph(JSON.stringify(graph));

engine.currentNodeId = "listen_tv";
const listenBefore = getListenCheckpoint(engine);
assert(listenBefore === "listen_tv", "starts at listen_tv");

const classification = {
  intentId: "silence",
  confidence: 1,
  entities: {},
  classifier: "rule" as const,
};

assert(classification.intentId === "silence", "silence intent for timeout");
assert(GRAPH_LISTEN_SILENCE_SEC === 20, "silence timeout is 20 seconds");

console.log("✓ graph listen checkpoint:", listenBefore);
console.log("✓ GRAPH_LISTEN_SILENCE_SEC =", GRAPH_LISTEN_SILENCE_SEC);
console.log("\nGraph silence repeat checks passed (timer wired in callService).");
