## 1. Server — patch types and apply

- [x] 1.1 Define `FlowGraphPatch` types and `applyFlowGraphPatch(draft, patch)` in `server/src/flow/`
- [x] 1.2 Reuse `validateFlowGraph` + `enhanceSigalGraph` after apply; return Hebrew errors on failure
- [x] 1.3 Add unit tests for patch apply (add node, update speak text, rewire edge)

## 2. Server — AI edit endpoint

- [x] 2.1 Add `POST /api/call-flows/active/ai-edit` route with auth
- [x] 2.2 Implement `flowAiEditService`: build compact graph summary + intent list for LLM prompt
- [x] 2.3 LLM returns structured JSON patch + `summaryHe`; scope refusal when off-topic or empty patch
- [x] 2.4 Response: `{ draftGraph, summaryHe, affectedNodeIds }`; auto-save draft on success
- [x] 2.5 Add server test or script for in-scope vs off-topic messages

## 3. Client — API and types

- [x] 3.1 Add `callFlowsApi.aiEdit(message, draftGraph?)` and TypeScript response types
- [x] 3.2 Wire draft graph from `FlowBuilderPage` state into API calls

## 4. Client — AI floating panel

- [x] 4.1 Create `FlowAiAssistantPanel` — draggable RTL floating window, message list, Hebrew input
- [x] 4.2 Add **AI** toolbar button on `FlowBuilderPage` to toggle panel
- [x] 4.3 Loading, error, and refusal states in Hebrew
- [x] 4.4 On success: apply `draftGraph` to React Flow + inspector state

## 5. Client — live focus and undo

- [x] 5.1 After AI edit: select/fit-view `affectedNodeIds` (reuse `requestFocusNode` / fit bounds)
- [x] 5.2 Maintain `aiUndoStack` (max 20 pre-patch snapshots); **בטל שינוי אחרון** button
- [x] 5.3 Clear undo stack on manual graph edits (nodes, edges, inspector saves)
- [x] 5.4 Disable undo when stack empty with Hebrew hint

## 6. Verification

- [ ] 6.1 Manual: ask to change speak text — see text update and node focused on canvas
- [ ] 6.2 Manual: ask to add a stage — new nodes appear and are visible
- [ ] 6.3 Manual: off-topic ask — Hebrew refusal, graph unchanged
- [ ] 6.4 Manual: undo 3 AI edits in a row, then confirm manual edit clears undo
