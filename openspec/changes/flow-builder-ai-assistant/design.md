## Context

**בניית זרימה** (`FlowBuilderPage`) loads the active call flow draft via `callFlowsApi`, edits nodes/edges in React Flow, validates with server-side `validateFlowGraph`, and publishes on success. Operators already have deep-link `?focus=` for node selection and fit-view. There is no natural-language editing path; all graph changes are manual.

The product already uses an LLM for in-call sales replies (`generateSalesReply`) with OpenAI configured in settings. This feature reuses that provider stack but targets **draft graph mutation**, not live call speech.

## Goals / Non-Goals

**Goals:**

- Hebrew floating AI panel on the flow builder with chat-style requests
- Apply **validated** patches to the current draft graph (nodes, edges, speak text, variables, bindings, side flows within scope)
- Refuse off-topic asks with clear Hebrew messages
- Highlight changed nodes on the canvas immediately after each successful patch
- **Undo last AI change** up to 20 times (per builder session / flow draft)
- Keep manual publish workflow unchanged — AI edits draft only until operator publishes

**Non-Goals:**

- Auto-publish or activate flows without operator confirmation
- Editing contacts, intents catalog, sales catalog, or call transcripts from this panel
- Multi-user collaborative editing or CRDT merge
- AI running during live calls (runtime flow execution unchanged)
- Generating entire flows from scratch in one shot (may be a follow-up; v1 supports incremental edits)

## Decisions

### 1. Server-side patch API (not client-only LLM)

**Choice:** `POST /api/call-flows/active/ai-edit` accepts `{ message, draftGraph?, undoToken? }`, runs scope check + LLM, returns `{ patch, summaryHe, affectedNodeIds, draftGraph, undoToken }`.

**Rationale:** Keeps API keys server-side; reuses `validateFlowGraph` and `enhanceSigalGraph` before accepting patches; single source of truth for what changed.

**Alternatives:** Client calls OpenAI directly — rejected (exposes keys, bypasses validation).

### 2. Structured patch format (not full graph replacement)

**Choice:** LLM outputs a JSON **patch** with bounded operations:

- `updateNode` / `addNode` / `deleteNode`
- `addEdge` / `updateEdge` / `deleteEdge`
- `updateSpeakText`, `updateVariable`, `addVariableBinding`, etc.

Server applies patch to draft, runs validation, rolls back on failure.

**Rationale:** Smaller tokens, easier undo (store pre-patch snapshot), safer than rewriting 50+ nodes.

### 3. Scope guard (two layers)

**Choice:**

1. **System prompt** limits assistant to flow-graph editing in Hebrew
2. **Server post-check**: if patch touches zero graph fields and message classified off-topic, return `400` with Hebrew refusal; block patches that modify `settings`, `contacts`, or non-flow APIs

Optional lightweight keyword pre-filter for obvious off-topic (e.g. "מה מזג האוויר").

**Rationale:** User asked AI be "only limited to relevant asks for the flow."

### 4. Live canvas focus

**Choice:** Response includes `affectedNodeIds: string[]`. Client:

1. Applies returned `draftGraph` to React Flow state
2. Selects first affected node in inspector
3. Calls existing `requestFocusNode` / sequential fit for multiple ids (fit bounds of affected set)

**Rationale:** Reuses proven focus UX from call-detail deep links.

### 5. Undo stack (20 deep)

**Choice:** Client maintains `aiUndoStack: FlowGraph[]` (max 20 entries). Before applying each successful AI patch, push **pre-patch** draft snapshot. **בטל שינוי אחרון** pops stack, restores draft, refreshes canvas.

- Manual edits after an AI patch **clear** the undo stack (or mark stale) to avoid surprising reversions
- Closing the AI panel does not clear stack until navigation away from builder

**Alternative:** Server-stored undo tokens — deferred; client stack sufficient for v1.

### 6. Floating panel UX

**Choice:** Draggable/resizable RTL panel (bottom-left default), message list + input, send on Enter, loading state, error/refusal banners. Toolbar **AI** button toggles panel.

**Rationale:** Keeps canvas visible while chatting; matches Hebrew RTL app.

### 7. LLM context payload

**Choice:** Send compact graph summary to model:

- Node list (id, type, label, text truncated)
- Edge list (source, target, intentId, condition)
- Variables, bindings, side flows
- Active intent ids from DB (labels Hebrew)
- User message in Hebrew

Not the full 3000-line JSON if avoidable — summarize for token limits, but apply patches against full draft server-side.

## Risks / Trade-offs

- **[Risk] LLM produces invalid graph** → Mitigation: validate after every patch; show Hebrew validation errors in panel; no partial apply
- **[Risk] LLM deletes critical path** → Mitigation: validation blocks publish; undo available; warn in summary when nodes removed
- **[Risk] Undo confusion with manual edits** → Mitigation: clear undo stack on manual change; show "ביטול לא זמין" when empty
- **[Risk] Token cost on large flows** → Mitigation: graph summarization; truncate speak text in prompt
- **[Risk] Off-topic slips through** → Mitigation: dual scope guard; empty patch = refusal

## Migration Plan

1. Ship API + client panel behind no feature flag (internal operators only)
2. No DB migration — uses existing `draftGraphJson`
3. Rollback: hide AI button; endpoint returns 404 if disabled

## Open Questions

- Should AI edits auto-save draft to server on each success, or only update local state until operator clicks **שמור טיוטה**? **Recommendation:** auto-save draft after each valid patch so refresh does not lose work.
- v2: multi-step "plan then apply" with preview diff before confirming?
