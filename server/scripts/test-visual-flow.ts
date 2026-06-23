import assert from "node:assert/strict";
import { GraphFlowEngine } from "../src/flow/graphFlowEngine.js";
import { createDefaultStarterFlow } from "../src/flow/starterFlow.js";
import { validateFlowGraph } from "../src/flow/graphValidation.js";
import { classifyUtterance } from "../src/services/intentService.js";
import { channelsInPacket, fuzzyMatchChannel } from "../src/services/catalogChannelLookup.js";

async function testGraphRouting() {
  const graph = createDefaultStarterFlow();
  const errors = validateFlowGraph(graph);
  assert.equal(errors.length, 0, `validation errors: ${JSON.stringify(errors)}`);

  const engine = new GraphFlowEngine(graph, "route_objections");
  const next = engine.advanceByClassification(
    {
      intentId: "price_objection",
      confidence: 0.9,
      entities: {},
      classifier: "rule",
    },
    { price_objection: 0.7 },
  );
  assert.equal(next?.id, "price_reply", `expected price_reply got ${next?.id}`);
  console.log("✓ graph routing: price_objection -> price_reply");
}

async function testClassification() {
  const result = await classifyUtterance("כמה זה עולה לחודש?");
  assert.equal(result.intentId, "price_objection");
  console.log("✓ classification: price question");
}

async function testChannelQa() {
  const sport = await fuzzyMatchChannel("ספורט 5");
  assert.ok(sport, "expected sport channel match");
  const kids = await channelsInPacket("ילדים");
  assert.ok(kids.length > 0, "expected channels in kids packet");
  console.log("✓ channel Q&A catalog lookup");
}

async function testFlowVersionPin() {
  const graph = createDefaultStarterFlow();
  const engine1 = new GraphFlowEngine(graph, graph.startNodeId);
  const v1Node = engine1.currentNodeId;
  const graph2 = createDefaultStarterFlow();
  graph2.nodes[0]!.text = "גרסה חדשה";
  const engine2 = new GraphFlowEngine(graph2, graph2.startNodeId);
  assert.notEqual(
    (engine1.getCurrentNode() as { text?: string })?.text,
    (engine2.getCurrentNode() as { text?: string })?.text,
  );
  assert.equal(engine1.currentNodeId, v1Node);
  console.log("✓ flow version pin: engines hold independent graph snapshots");
}

async function main() {
  await testGraphRouting();
  await testClassification();
  await testChannelQa();
  await testFlowVersionPin();
  console.log("\nAll integration tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
