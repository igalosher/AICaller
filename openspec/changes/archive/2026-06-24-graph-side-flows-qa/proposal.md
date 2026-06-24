## Why

Graph flows needed configurable **side flows** (e.g. small talk) that do not advance the main qualification path, **listen-scoped classification** so answers like "רגיל" route as qualification—not product Q&A—and **reliable speak-node behavior** so scripted prompts are not replaced by LLM misinterpretations. Operators also hit validation errors when `CustomerAddress` bindings existed without a matching flow variable after graph edits.

## What Changes

- Add **side flows** on `FlowGraph`: intent → disconnected speak chain with optional `returnsToMain` on speak nodes; runtime saves a main checkpoint and repeats the last question after the side chain
- **Listen-scoped qualification intents** derived from route edges and variable bindings; classification and routing honor scope at the active listen checkpoint
- **Graph Q&A interrupt** (`interruptQa`): answer off-script product questions without advancing; main-path answers and side-flow intents take priority over Q&A
- **Speak nodes** invoke LLM only when `useLlm` is true; main-path routing uses static template text even when the customer utterance is available for ack nodes
- **Auto-ensure flow variables** for bindings (`CustomerAddress`, `NumOfTVs`, etc.) on graph enhance, save, and publish
- **Mid-call LLM** uses a separate system prompt without re-introduction; post-filter strips repeated Sigal intros
- **OpenAI balance badge** in the operator header (link to billing when balance API unavailable)
- Remove **linear-to-graph import** from Flow Builder UI and backend route

## Capabilities

### New Capabilities

- `flow-side-flows`: Side flow definitions, disconnected speak chains, `returnsToMain`, and main checkpoint restore

### Modified Capabilities

- `visual-flow-builder`: Side flows tab, `returnsToMain` on speak nodes, removed linear import
- `call-flow-configuration`: Side flow runtime, scoped routing priority, speak LLM gating, graph enhance on save/publish
- `conversation-classification`: Listen-scoped qualification intents; demote out-of-scope rule/LLM hits
- `flow-qa-interrupt`: Graph-flow Q&A interrupt with main-path and side-flow precedence
- `flow-session-variables`: Auto-ensure variables for bindings and known listen nodes
- `hebrew-voice-ai`: Mid-call replies without re-introduction; static speak after qualification answers
- `agent-persona`: Mid-call persona constraints for Q&A and `useLlm` nodes only
- `operator-ui`: OpenAI balance badge in layout header

## Impact

- **Server**: `sideFlowRuntime.ts`, `graphFlowRuntime.ts`, `callService.ts`, `intentService.ts`, `sigalMiniFlow.ts`, `flowGraphService.ts`, `llm.ts`, `openaiBillingService.ts`; removed `linearToGraph.ts`
- **Client**: `FlowBuilderPage.tsx` side flows UI, `OpenAiBalanceBadge.tsx`, `Layout.tsx`
- **Data**: `FlowGraph.sideFlows`, `SpeakNode.returnsToMain`, `contextJson.mainCheckpoint`
