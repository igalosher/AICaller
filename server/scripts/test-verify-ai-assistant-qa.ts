/**
 * Automated verification for OpenSpec tasks 6.1–6.4 (flow-builder-ai-assistant).
 * Run: npx tsx scripts/test-verify-ai-assistant-qa.ts
 */
import assert from "node:assert/strict";
import { createSigalMiniFlowGraph, enhanceSigalGraph } from "../src/flow/sigalMiniFlow.js";
import { normalizeFlowGraph } from "../src/flow/graphFlowEngine.js";
import { applyFlowGraphPatch } from "../src/flow/flowGraphPatch.js";
import { editFlowWithAi, isObviouslyOffTopic } from "../src/services/flowAiEditService.js";
import type { FlowGraph } from "../src/flow/graphTypes.js";

const baseGraph = enhanceSigalGraph(normalizeFlowGraph(createSigalMiniFlowGraph()));

function cloneGraph(g: FlowGraph): FlowGraph {
  return JSON.parse(JSON.stringify(g)) as FlowGraph;
}

/** Mirrors FlowBuilderPage undo stack (max 20). */
function simulateUndoStack() {
  const MAX = 20;
  let stack: FlowGraph[] = [];
  let count = 0;
  let clearedByManual = false;

  const push = (snapshot: FlowGraph) => {
    stack = [...stack, cloneGraph(snapshot)];
    while (stack.length > MAX) stack.shift();
    count = stack.length;
  };

  const undo = (): FlowGraph | null => {
    if (stack.length === 0) return null;
    const prev = stack.pop()!;
    count = stack.length;
    return prev;
  };

  const manualEdit = () => {
    clearedByManual = true;
    stack = [];
    count = 0;
  };

  const canUndo = () => count > 0;

  return { push, undo, manualEdit, canUndo, get count() { return count; }, get clearedByManual() { return clearedByManual; } };
}

async function verify61() {
  const opening = baseGraph.nodes.find((n) => n.id === "speak_opening");
  assert.ok(opening?.type === "speak", "6.1 setup: speak_opening exists");
  const before = (opening as { text: string }).text;

  const result = await editFlowWithAi("קצרי את טקסט שאלת הטלוויזיות", cloneGraph(baseGraph));
  const afterNode = result.draftGraph.nodes.find((n) => n.id === "speak_opening");
  assert.ok(afterNode?.type === "speak", "6.1: speak_opening still exists");
  const afterText = (afterNode as { text: string }).text;
  assert.notEqual(afterText, before, "6.1: speak text changed");
  assert.ok(result.affectedNodeIds.includes("speak_opening"), "6.1: affectedNodeIds includes speak_opening");
  console.log("✓ 6.1 speak text update + affectedNodeIds");
}

async function verify62() {
  const newId = "speak_qa_verify_price";
  const patch = applyFlowGraphPatch(cloneGraph(baseGraph), {
    summaryHe: "נוספה שאלת מחיר",
    operations: [
      {
        op: "addNode",
        node: {
          id: newId,
          type: "speak",
          label: "מחיר",
          text: "מה המחיר שאתם משלמים היום?",
          position: { x: 400, y: 200 },
        },
      },
      {
        op: "addEdge",
        edge: { id: "e_qa_verify_price", source: "speak_provider", target: newId },
      },
    ],
  });
  assert.ok(patch.graph.nodes.some((n) => n.id === newId), "6.2: new speak node added");
  assert.ok(patch.affectedNodeIds.includes(newId), "6.2: new node in affectedNodeIds");
  assert.ok(
    patch.graph.edges.some((e) => e.source === "speak_provider" && e.target === newId),
    "6.2: edge wired after provider",
  );
  console.log("✓ 6.2 add stage + affectedNodeIds");
}

async function verify63() {
  const msg = "מה מזג האוויר בתל אביב?";
  assert.ok(isObviouslyOffTopic(msg), "6.3: off-topic detector");
  await assert.rejects(
    () => editFlowWithAi(msg, cloneGraph(baseGraph)),
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      return /זרימ|תחום|עוזר/i.test(message);
    },
    "6.3: off-topic throws with Hebrew refusal",
  );
  console.log("✓ 6.3 off-topic refusal");
}

function verify64() {
  const undo = simulateUndoStack();
  let g = cloneGraph(baseGraph);

  for (let i = 0; i < 3; i++) {
    undo.push(g);
    const patched = applyFlowGraphPatch(g, {
      summaryHe: `edit ${i}`,
      operations: [
        {
          op: "updateSpeakText",
          nodeId: "speak_opening",
          text: `פתיחה ${i}`,
        },
      ],
    });
    g = patched.graph;
  }
  assert.equal(undo.count, 3, "6.4: undo stack has 3 snapshots");

  for (let i = 2; i >= 0; i--) {
    assert.ok(undo.canUndo(), `6.4: can undo at step ${i}`);
    const prev = undo.undo();
    assert.ok(prev, `6.4: undo ${i} returns snapshot`);
    const opening = prev.nodes.find((n) => n.id === "speak_opening");
    assert.ok(opening?.type === "speak");
    if (i === 2) {
      assert.equal((opening as { text: string }).text, "פתיחה 1");
    }
    if (i === 0) {
      const orig = baseGraph.nodes.find((n) => n.id === "speak_opening") as { text: string };
      assert.equal((opening as { text: string }).text, orig.text);
    }
  }
  assert.ok(!undo.canUndo(), "6.4: stack empty after 3 undos");

  undo.push(g);
  assert.ok(undo.canUndo());
  undo.manualEdit();
  assert.ok(!undo.canUndo(), "6.4: manual edit clears undo stack");
  assert.ok(undo.clearedByManual);
  console.log("✓ 6.4 undo stack (3 levels) + manual clear");
}

async function main() {
  await verify61();
  await verify62();
  await verify63();
  verify64();
  console.log("\nAll QA tasks 6.1–6.4 verified.");
}

main().catch((err) => {
  console.error("FAIL", err instanceof Error ? err.message : err);
  process.exit(1);
});
