import assert from "node:assert/strict";
import { GraphFlowEngine } from "../src/flow/graphFlowEngine.js";
import { createDefaultStarterFlow, SIGAL_OPENING, SOLD_GOODBYE } from "../src/flow/starterFlow.js";
import { validateFlowGraph } from "../src/flow/graphValidation.js";
import { classifyUtterance } from "../src/services/intentService.js";
import { detectOutcome } from "../src/voice/llm.js";
import { channelsInPacket, fuzzyMatchChannel } from "../src/services/catalogChannelLookup.js";
import {
  listCatalogInternetTiers,
  routerRentalInfo,
} from "../src/services/catalogInternetLookup.js";

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

async function testSigalOpening() {
  const graph = createDefaultStarterFlow();
  const start = graph.nodes.find((n) => n.id === "start");
  assert.ok(start?.type === "speak" && start.text.includes("{{agent_name}}"));
  assert.ok(SIGAL_OPENING.includes("מבצע"), "opening should offer deals, not ask to buy");
  console.log("✓ Sigal opening template in starter flow");
}

async function testSmallTalkRouting() {
  const graph = createDefaultStarterFlow();
  const engine = new GraphFlowEngine(graph, "route_open");
  const next = engine.advanceByClassification(
    { intentId: "small_talk", confidence: 0.9, entities: {}, classifier: "rule" },
    { small_talk: 0.7 },
  );
  assert.equal(next?.id, "small_talk_reply");
  console.log("✓ graph routing: small_talk -> small_talk_reply");
}

async function testInsultIntent() {
  const result = await classifyUtterance("את טמבל");
  assert.equal(result.intentId, "insult_profanity");
  console.log("✓ classification: insult_profanity");
}

async function testConfirmRefusalTwoStep() {
  const first = await classifyUtterance("לא מעוניין");
  assert.equal(first.intentId, "not_interested");

  const premature = await classifyUtterance("בטוח", { currentNodeId: "pitch" });
  assert.notEqual(premature.intentId, "not_interested_confirmed");

  const confirmed = await classifyUtterance("כן בטוח", {
    currentNodeId: "listen_confirm",
    awaitingRefusalConfirm: true,
  });
  assert.equal(confirmed.intentId, "not_interested_confirmed");

  const graph = createDefaultStarterFlow();
  const engine = new GraphFlowEngine(graph, "route_confirm");
  const next = engine.advanceByClassification(confirmed, { not_interested_confirmed: 0.7 });
  assert.equal(next?.id, "goodbye_refused");
  console.log("✓ confirm-refusal two-step routing");
}

async function testInternetRouterLookup() {
  const tiers = await listCatalogInternetTiers();
  assert.ok(tiers.length > 0, "expected internet tiers from catalog");
  const router = await routerRentalInfo();
  assert.ok(router.summaryHe.includes("נתב") || router.summaryHe.includes("שכירות"));
  console.log("✓ internet/router catalog lookup");
}

async function testOptionsCompareNoFalseSale() {
  const result = await classifyUtterance("מה עוד את מציעה?");
  assert.equal(result.intentId, "ask_options_compare");

  const graph = createDefaultStarterFlow();
  const engine = new GraphFlowEngine(graph, "route_objections");
  const next = engine.advanceByClassification(result, { ask_options_compare: 0.7 });
  assert.equal(next?.id, "options_reply");

  const edge = graph.edges.find((e) => e.source === "options_reply");
  assert.equal(edge?.target, "listen_pitch", "Q&A should return to listening, not close");

  const closePrompt = "האם תרצה לסגור את העסקה היום ולקבל את כל הפרטים?";
  assert.equal(detectOutcome(closePrompt), null, "agent close prompt must not trigger sold");
  assert.equal(detectOutcome("מה עוד את מציעה?"), null, "options question must not trigger sold");
  console.log("✓ options compare does not false-trigger sale/hangup");
}

async function testSoldGoodbyeRouting() {
  const graph = createDefaultStarterFlow();
  const engine = new GraphFlowEngine(graph, "route_close");
  const next = engine.advanceByClassification(
    { intentId: "agree_purchase", confidence: 0.9, entities: {}, classifier: "rule" },
    { agree_purchase: 0.7 },
  );
  assert.equal(next?.id, "goodbye_sold");
  assert.equal(
    (graph.nodes.find((n) => n.id === "goodbye_sold") as { text?: string })?.text,
    SOLD_GOODBYE,
  );
  console.log("✓ agree_purchase routes to human-followup goodbye");
}

async function main() {
  await testGraphRouting();
  await testClassification();
  await testChannelQa();
  await testFlowVersionPin();
  await testSigalOpening();
  await testSmallTalkRouting();
  await testInsultIntent();
  await testConfirmRefusalTwoStep();
  await testInternetRouterLookup();
  await testOptionsCompareNoFalseSale();
  await testSoldGoodbyeRouting();
  console.log("\nAll integration tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
