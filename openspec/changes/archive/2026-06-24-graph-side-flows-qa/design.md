## Context

Sigal MiniFlow runs as a published graph. Operators configure qualification via listen → route edges. Product Q&A must coexist without stealing answers like "רגיל" (internet type) or "3" (TV count). Side flows (e.g. "מה שלומך") must be configurable without hard-coded node IDs.

## Goals

- Generic `sideFlows[]` on the graph, not canvas edges from main path
- Classification scope derived from the **active listen checkpoint** (engine position), not global intent lists
- Main-path answers never trigger Q&A interrupt or LLM on non-`useLlm` speak nodes
- Variables stay consistent when bindings are auto-patched

## Non-Goals

- Replacing staged flow runtime (still supported for legacy)
- Real-time OpenAI billing API (badge links to dashboard when unavailable)

## Decisions

### Side flow entry priority

At each listen turn: **side flow** (if intent matches and not a main-path answer) → **main route** → **Q&A interrupt** → advance.

`returnsToMain` speak nodes restore `mainCheckpoint` and append the saved stage question.

### Listen scope

`getListenScopedIntentIds` collects intent IDs from outgoing route edges plus binding-derived intents. `ruleStagedQualification` and final classify demotion apply `passesListenScope`. Session engine position is restored before classification.

### Speak LLM gating

`speakFromNode` calls `generateSalesReply` only when `node.useLlm === true`. Passing customer text into static speak nodes caused "רגיל" to be answered as a package question.

### Variable auto-ensure

`ensureFlowVariables` adds missing defs for bindings and for `listen_address` / `listen_tv`. `enhanceSigalGraph` runs on draft save and publish so validation and runtime stay aligned.

## Risks / Trade-offs

- Side flow speak chains must end with `returnsToMain` or connect back to a listen node (validated at publish)
- Operators who relied on implicit LLM paraphrase on static speak nodes will hear exact template text unless `useLlm` is enabled
