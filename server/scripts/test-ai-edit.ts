import { createSigalMiniFlowGraph, enhanceSigalGraph } from "../src/flow/sigalMiniFlow.js";
import { editFlowWithAi } from "../src/services/flowAiEditService.js";

const graph = enhanceSigalGraph(createSigalMiniFlowGraph());
try {
  const result = await editFlowWithAi("קצרי את טקסט שאלת הטלוויזיות", graph);
  console.log("OK", result.summaryHe, "affected", result.affectedNodeIds.length);
} catch (err) {
  console.error("FAIL", err instanceof Error ? err.message : err);
  process.exit(1);
}
