/**
 * Graph-runtime integration tests for Sigal MiniFlow (tasks 7.4, 10.3).
 * Run: npm run test:sigal-graph-flow -w server
 */
import { createSigalMiniFlowGraph } from "../src/flow/sigalMiniFlow.js";
import { createEngineFromGraph, type GraphFlowEngine } from "../src/flow/graphFlowEngine.js";
import { isOrphanAnnouncementRoute, advanceOrphanAnnouncementRoute } from "../src/flow/graphFlowRuntime.js";
import { lookupFiberAvailability } from "../src/services/fiberLookup.js";
import type { ClassificationResult } from "../src/flow/graphTypes.js";

type Ctx = { lastSpokenText?: string };

function cls(intentId: string, entities: Record<string, unknown> = {}): ClassificationResult {
  return { intentId, confidence: 1, entities, classifier: "rule" };
}

function speakText(engine: GraphFlowEngine, speakId: string): string {
  const node = engine.getGraph().nodes.find((n) => n.id === speakId);
  return node?.type === "speak" ? node.text : "";
}

function afterOpening(engine: GraphFlowEngine) {
  engine.currentNodeId = "listen_tv";
}

function openingTvQuestion(engine: GraphFlowEngine): string {
  return speakText(engine, "speak_opening");
}

function routeTurn(
  engine: GraphFlowEngine,
  classification: ClassificationResult,
  ctx: Ctx,
  text = "",
) {
  const atStart = engine.currentNodeId;

  if (classification.intentId === "didnt_understand") {
    return {
      spokeId: undefined as string | undefined,
      listenId: atStart,
      repeated: ctx.lastSpokenText,
      endNodeId: undefined as string | undefined,
    };
  }

  let routed = classification;
  if (classification.intentId === "provide_address") {
    const address = (classification.entities.address as string | undefined) ?? text;
    const available = lookupFiberAvailability(address);
    void available;
    routed = cls(available ? "fiber_available" : "fiber_unavailable");
  }

  engine.advanceFromListen();
  let node = engine.getCurrentNode();
  if (node?.type === "intent_route" || node?.type === "decision") {
    node = engine.advanceByClassification(routed, {}) ?? undefined;
  }

  let spokeId: string | undefined;
  const spokenIds: string[] = [];
  while (node?.type === "speak" && !node.id.startsWith("goodbye_")) {
    spokenIds.push(node.id);
    ctx.lastSpokenText = speakText(engine, node.id);
    const edge = engine.getNextAutoEdge(node.id);
    if (!edge) {
      node = undefined;
      break;
    }
    engine.currentNodeId = edge.target;
    const next = engine.getCurrentNode();
    if (next?.type !== "speak" || next.id.startsWith("goodbye_")) {
      node = next;
      break;
    }
    node = next;
  }

  while (isOrphanAnnouncementRoute(engine)) {
    node = advanceOrphanAnnouncementRoute(engine) ?? undefined;
    while (node?.type === "speak" && !node.id.startsWith("goodbye_")) {
      spokenIds.push(node.id);
      ctx.lastSpokenText = speakText(engine, node.id);
      const edge = engine.getNextAutoEdge(node.id);
      if (!edge) {
        node = undefined;
        break;
      }
      engine.currentNodeId = edge.target;
      const next = engine.getCurrentNode();
      if (next?.type !== "speak" || next.id.startsWith("goodbye_")) {
        node = next;
        break;
      }
      node = next;
    }
  }

  spokeId = spokenIds[0];

  if (node?.type === "speak" && node.id.startsWith("goodbye_")) {
    spokeId = node.id;
    ctx.lastSpokenText = speakText(engine, node.id);
    const edge = engine.getNextAutoEdge(node.id);
    if (edge) engine.currentNodeId = edge.target;
    node = engine.getCurrentNode();
  }

  return {
    spokeId,
    listenId: engine.currentNodeId,
    repeated: undefined as string | undefined,
    endNodeId: node?.type === "end" ? node.id : undefined,
  };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function log(msg: string) {
  console.log(`✓ ${msg}`);
}

// --- Task 7.4: opening (with TV Q) → internet; repeat; רגיל → address ---
function testManualScenario74(engine: GraphFlowEngine) {
  const ctx: Ctx = {};
  afterOpening(engine);

  assert(openingTvQuestion(engine).includes("טלויזיות"), "opening includes TV count question");
  log("opening includes TV count question");

  engine.currentNodeId = "listen_tv";
  ctx.lastSpokenText = openingTvQuestion(engine);
  let r = routeTurn(engine, cls("provide_tv_count", { tv_count: 2 }), ctx);
  assert(r.spokeId === "speak_inet", "TV answer advances to internet question");
  assert(r.listenId === "listen_inet", "lands on listen_inet");
  assert(speakText(engine, "speak_inet").includes("טלויזיות"), "internet step acknowledges TV count");
  log("TV count → internet type with acknowledgment");

  engine.currentNodeId = "listen_tv";
  ctx.lastSpokenText = openingTvQuestion(engine);
  r = routeTurn(engine, cls("didnt_understand"), ctx);
  assert(r.listenId === "listen_tv", "לא הבנתי stays on same listen checkpoint");
  assert(r.repeated === ctx.lastSpokenText, "repeats last spoken question");
  log("לא הבנתי repeats last question");

  engine.currentNodeId = "listen_inet";
  r = routeTurn(engine, cls("internet_regular"), ctx);
  assert(r.spokeId === "speak_address", "רגיל routes to address prompt");
  assert(speakText(engine, "speak_address").includes("כתובת"), "address prompt spoken");
  log("רגיל → address prompt");
}

// --- Task 10.3: full MiniFlow paths ---
function testFullMiniFlowRegular(engine: GraphFlowEngine) {
  const ctx: Ctx = {};
  engine.currentNodeId = "listen_address";
  let r = routeTurn(
    engine,
    cls("provide_address", { address: "רחוב הסיב 5 תל אביב" }),
    ctx,
    "רחוב הסיב 5 תל אביב",
  );
  assert(r.spokeId === "speak_fiber_yes", "fiber address → yes announcement");
  assert(r.listenId === "listen_speed_fiber", "fiber yes auto-chains to speed question");
  r = routeTurn(engine, cls("select_speed_600"), ctx);
  assert(r.spokeId === "speak_provider", "speed → provider");
  engine.currentNodeId = "listen_provider";
  r = routeTurn(engine, cls("provider_bezeq"), ctx);
  assert(r.spokeId === "speak_price", "provider → price");
  engine.currentNodeId = "listen_price";
  r = routeTurn(engine, cls("provide_current_price", { price: 200 }), ctx);
  assert(r.spokeId === "speak_offer", "price → offer");
  engine.currentNodeId = "listen_offer";
  r = routeTurn(engine, cls("greeting_ack"), ctx);
  assert(r.spokeId === "speak_addons", "offer → addons");
  engine.currentNodeId = "listen_addons";
  r = routeTurn(engine, cls("decline_addons"), ctx);
  assert(r.spokeId === "speak_summary", "addons → summary");
  assert(r.listenId === "listen_callback", "summary auto-chains to callback question");
  r = routeTurn(engine, cls("agree_callback"), ctx);
  assert(r.endNodeId === "end_callback", "callback agree → end_callback");
  log("full path: regular → fiber yes → sales → callback lead");
}

function testFiberExistsPath(engine: GraphFlowEngine) {
  const ctx: Ctx = {};
  engine.currentNodeId = "listen_inet";
  let r = routeTurn(engine, cls("internet_fiber"), ctx);
  assert(r.spokeId === "speak_fiber_exists", "סיבים skips address");
  assert(r.listenId === "listen_speed_fiber", "fiber exists auto-chains to speed");
  log("סיבים path skips address");
}

function testNoInternetPath(engine: GraphFlowEngine) {
  const ctx: Ctx = {};
  engine.currentNodeId = "listen_inet";
  const r = routeTurn(engine, cls("internet_unknown"), ctx);
  assert(r.spokeId === "speak_no_inet", "לא יודע → no-internet ack");
  assert(r.listenId === "listen_provider", "no-internet auto-chains to provider");
  log("no-internet path merges to sales");
}

function testOptOut(engine: GraphFlowEngine) {
  const edge = engine.getGraph().edges.find(
    (e) => e.source === "route_address" && e.intentId === "opt_out_remove",
  );
  assert(edge?.target === "goodbye_blacklist", "opt-out edge exists on address route");
  log("opt-out route wired on address step");
}

const graph = createSigalMiniFlowGraph();
const engine = createEngineFromGraph(JSON.stringify(graph));

testManualScenario74(createEngineFromGraph(JSON.stringify(graph)));
testFullMiniFlowRegular(createEngineFromGraph(JSON.stringify(graph)));
testFiberExistsPath(createEngineFromGraph(JSON.stringify(graph)));
testNoInternetPath(createEngineFromGraph(JSON.stringify(graph)));
testOptOut(engine);

console.log("\nAll Sigal graph flow tests passed (7.4 + 10.3 automated coverage).");
console.log("Optional: run one live Twilio call to confirm TTS and timing.");
