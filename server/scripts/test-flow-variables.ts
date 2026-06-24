import assert from "node:assert/strict";
import { GraphFlowEngine } from "../src/flow/graphFlowEngine.js";
import { evaluateCondition } from "../src/flow/conditionEvaluator.js";
import { lookupExists, parseLookupRows, validateLookupTableSize } from "../src/flow/lookupQuery.js";
import {
  applyListenBindings,
  coerceToType,
  initSessionVariables,
} from "../src/flow/variableBinding.js";
import { validateFlowGraph } from "../src/flow/graphValidation.js";
import type { FlowGraph } from "../src/flow/graphTypes.js";

function testLookupParse() {
  const rows = parseLookupRows([{ model: "LG", tier: "premium" }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.model, "LG");
  console.log("✓ lookup parse");
}

function testLookupExists() {
  const tables = [
    {
      name: "TvModels",
      rows: [
        { model: "LG55", tier: "premium" },
        { model: "Samsung32", tier: "basic" },
      ],
    },
  ];
  assert.equal(lookupExists(tables, "TvModels", "model", "LG55"), true);
  assert.equal(lookupExists(tables, "TvModels", "model", "Sony"), false);
  console.log("✓ lookup_exists");
}

function testConditionEval() {
  const vars = { NumOfTVs: 3 };
  assert.equal(
    evaluateCondition({ op: "var_gte", variable: "NumOfTVs", literal: 2 }, vars, []),
    true,
  );
  assert.equal(
    evaluateCondition({ op: "var_eq", variable: "NumOfTVs", literal: 1 }, vars, []),
    false,
  );
  console.log("✓ condition evaluation");
}

function testBindingCoercion() {
  const defs = [{ name: "NumOfTVs", type: "int" as const }];
  const vars = applyListenBindings(
    [{ listenNodeId: "listen_q", variableName: "NumOfTVs", source: "entity" }],
    "listen_q",
    {
      intentId: "provide_tv_count",
      confidence: 1,
      entities: { tv_count: 4 },
      classifier: "rule",
    },
    "",
    defs,
    {},
  );
  assert.equal(vars.NumOfTVs, 4);
  assert.equal(coerceToType("2", "int"), 2);
  console.log("✓ binding coercion");
}

function testValidationDuplicateVariable() {
  const graph: FlowGraph = {
    startNodeId: "s",
    nodes: [
      { id: "s", type: "speak", text: "hi" },
      { id: "e", type: "end", outcome: "none" },
    ],
    edges: [{ id: "e1", source: "s", target: "e" }],
    variables: [
      { name: "NumOfTVs", type: "int" },
      { name: "NumOfTVs", type: "int" },
    ],
  };
  const errors = validateFlowGraph(graph);
  assert.ok(errors.some((e) => e.messageHe.includes("כפול")));
  console.log("✓ validation duplicate variable");
}

function testIntegrationVariableDecision() {
  const graph: FlowGraph = {
    startNodeId: "speak_q",
    variables: [{ name: "NumOfTVs", type: "int", defaultValue: 0 }],
    variableBindings: [
      { listenNodeId: "listen_q", variableName: "NumOfTVs", source: "entity" },
    ],
    nodes: [
      { id: "speak_q", type: "speak", text: "כמה טלוויזיות?" },
      { id: "listen_q", type: "listen" },
      { id: "decide", type: "decision", label: "החלטה" },
      { id: "speak_many", type: "speak", text: "יש לך {{NumOfTVs}} מכשירים" },
      { id: "speak_few", type: "speak", text: "מכשיר אחד בלבד" },
      { id: "end", type: "end", outcome: "none" },
    ],
    edges: [
      { id: "e1", source: "speak_q", target: "listen_q" },
      { id: "e2", source: "listen_q", target: "decide" },
      {
        id: "e3",
        source: "decide",
        target: "speak_many",
        condition: { op: "var_gte", variable: "NumOfTVs", literal: 2 },
      },
      { id: "e4", source: "decide", target: "speak_few", isDefault: true },
      { id: "e5", source: "speak_many", target: "end" },
      { id: "e6", source: "speak_few", target: "end" },
    ],
  };

  const errors = validateFlowGraph(graph);
  assert.equal(errors.length, 0, JSON.stringify(errors));

  const engine = new GraphFlowEngine(graph, "listen_q");
  const vars = applyListenBindings(
    graph.variableBindings,
    "listen_q",
    {
      intentId: "provide_tv_count",
      confidence: 1,
      entities: { tv_count: 3 },
      classifier: "rule",
    },
    "",
    graph.variables!,
    initSessionVariables(graph.variables),
  );

  engine.advanceFromListen();
  const next = engine.advanceByDecision(vars);
  assert.equal(next?.id, "speak_many");

  const speakText = engine.renderSpeakText(
    next as { type: "speak"; text: string },
    { NumOfTVs: "3" },
  );
  assert.ok(speakText.includes("3"));
  console.log("✓ integration: bind → decision → speak template");
}

function main() {
  testLookupParse();
  testLookupExists();
  testConditionEval();
  testBindingCoercion();
  testValidationDuplicateVariable();
  testIntegrationVariableDecision();
  console.log("\nAll flow variable tests passed.");
}

main();
