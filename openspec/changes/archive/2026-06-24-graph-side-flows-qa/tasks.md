## 1. Side flow model and runtime

- [x] 1.1 Add `SideFlowDef`, `returnsToMain`, `sideFlows`, `MainFlowCheckpoint` to graph types
- [x] 1.2 Implement `sideFlowRuntime.ts` — entry detection, speak chain collection, main restore
- [x] 1.3 Wire `runSideFlowEntry` in `callService.ts` with checkpoint save/restore
- [x] 1.4 Validate side flows at publish (entry speak, `returnsToMain` or listen return)

## 2. Scoped classification and routing

- [x] 2.1 `getListenScopedIntentIds` from route edges and bindings
- [x] 2.2 `isMainPathAnswer` and `shouldInterruptQa` in `graphFlowRuntime.ts`
- [x] 2.3 Scope filter on `ruleClassify`/LLM results; classify from engine listen checkpoint
- [x] 2.4 Defensive Q&A guard when classification is a main-path answer

## 3. Speak and LLM behavior

- [x] 3.1 LLM only when `node.useLlm`; do not pass userMessage to static speak nodes on advance
- [x] 3.2 `SYSTEM_PROMPT_MID_CALL` and `stripRepeatedIntroduction` in `llm.ts`
- [x] 3.3 `isOpeningTurn` only on opening speak nodes

## 4. Flow variables and builder

- [x] 4.1 `ensureFlowVariables` and `mergeAddressBinding` in `sigalMiniFlow.ts`
- [x] 4.2 `enhanceSigalGraph` on draft save and publish
- [x] 4.3 Flow Builder: side flows tab, `returnsToMain` checkbox
- [x] 4.4 Remove linear import UI and `linearToGraph.ts`

## 5. Operator UI

- [x] 5.1 OpenAI balance badge in layout header
- [x] 5.2 `GET /settings/ai/balance` endpoint

## 6. Verification

- [x] 6.1 "רגיל" at `listen_inet` advances to address prompt (not package Q&A)
- [x] 6.2 `CustomerAddress` auto-added when binding exists without variable def
- [x] 6.3 Small-talk side flow returns to main question with `returnsToMain`
