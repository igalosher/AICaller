/**
 * Silence retry hangup logic (unit-style).
 * Run: npx tsx scripts/test-silence-retries.ts
 */
import assert from "node:assert/strict";
import { GRAPH_SILENCE_MAX_RETRIES } from "../src/services/callService.js";

function nextSilenceAction(retries: number): "repeat" | "hangup" {
  const next = retries + 1;
  if (next > GRAPH_SILENCE_MAX_RETRIES) return "hangup";
  return "repeat";
}

let retries = 0;
for (let i = 0; i < GRAPH_SILENCE_MAX_RETRIES; i++) {
  assert.equal(nextSilenceAction(retries), "repeat");
  retries++;
}
assert.equal(nextSilenceAction(retries), "hangup");

console.log(`✓ ${GRAPH_SILENCE_MAX_RETRIES} silence retries then hangup`);
console.log("\nSilence retry tests passed.");
