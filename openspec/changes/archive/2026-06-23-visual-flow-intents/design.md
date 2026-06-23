## Context

Alpha v1 ships a linear `CallFlowEngine` (ordered stages + objections JSON), a text-based Call Flow page, and LLM replies without structured intent routing. The YES catalog (`yes-catalog.json`) includes channels with Hebrew names/descriptions, but Q&A is generic LLM over packets. Operators cannot branch on "customer asked about Sport 5" vs. "price objection" vs. "wants callback" without code changes.

Constraints: Hebrew RTL UI, existing Twilio + ElevenLabs + Deepgram stack, SQLite/Prisma, single-tenant operator app.

## Goals / Non-Goals

**Goals:**
- Visual graph editor for conversation flows (nodes: speak, listen, decision, intent-branch, end)
- Runtime that advances the call based on classified customer intent + decision edges
- Intent catalog + management UI with editable example phrases and thresholds
- Classify every customer utterance (intent label, confidence, optional entities) and persist on transcript
- Channel-aware answers: package lists, "is channel X included?", single-channel description
- Ship a default starter YES sales flow as the active graph on first deploy after migration

**Non-Goals:**
- Drag-and-drop voice recording or custom TTS per node (still ElevenLabs + templates)
- Multi-tenant / role-based access control
- Auto-learning intent model training pipeline (operators edit examples; LLM classifies at runtime)
- Visual telephony designer (hold music, DTMF trees)

## Decisions

### 1. Flow model: directed graph stored as JSON

**Decision:** `FlowGraph` = `{ nodes: FlowNode[], edges: FlowEdge[], version }` stored in Prisma (`graphJson` on `CallFlow` or new table). Node types: `speak`, `listen`, `decision`, `intent_route`, `end`.

**Rationale:** Matches operator mental model (if/else, branches). React Flow renders and edits the same JSON the server executes.

**Alternatives:** Keep linear stages only (rejected—user requirement); BPMN XML (overkill).

### 2. Intent classification: hybrid LLM + keyword rules

**Decision:** On each final STT transcript:
1. Run fast keyword/regex rules from `IntentExample` phrases (high confidence match → skip LLM)
2. Else call OpenAI with constrained JSON schema: `{ intentId, confidence, entities: { channel?, packet? } }` against active intent catalog

**Rationale:** Operators can fix misclassification by adding Hebrew examples without retraining. LLM handles paraphrase.

**Alternatives:** Deepgram intents (less flexible for Hebrew sales domain); pure LLM (harder to tune).

### 3. Flow runtime replaces linear `advance()`

**Decision:** `GraphFlowEngine` holds `currentNodeId`. After classification:
- `listen` node → classify → follow edge matching `intentId` or `default`
- `decision` node → evaluate condition (intent equals, outcome, entity present)
- `speak` node → render template + optional LLM fill → TTS → auto-advance to next via single outgoing edge or `listen` child

**Rationale:** Single execution path; linear flows migrated to a simple chain graph.

### 4. Channel Q&A: structured tools before free LLM

**Decision:** Extend `productKnowledge` with `get_channel(name)`, `channels_in_packet(packetId)`, `describe_channel(name)` used by speak/QA nodes and LLM system prompt.

**Rationale:** Catalog already loaded; reduces hallucination on channel names.

### 5. UI: React Flow + dedicated Intent Management page

**Decision:** `@xyflow/react` for flow canvas; new routes `/flow-builder`, `/intents`. Call transcript shows intent badge per customer line.

**Alternatives:** Mermaid text editor (not graphical enough).

### 6. Migration from linear stages

**Decision:** One-time migration script: each legacy stage → `speak` + `listen` chain; objections → `intent_route` branches on objection intents. Starter flow seeded if no graph exists.

## Risks / Trade-offs

- **[Risk] Graph complexity confuses operators** → Mitigation: starter template, node palette labels in Hebrew, validation before publish
- **[Risk] Intent misclassification breaks flow** → Mitigation: `default` edges, fallback LLM reply node, intent management screen to add examples from call review
- **[Risk] Latency adds classification step** → Mitigation: rules-first path; target &lt;500ms classification budget before TTS
- **[Risk] Breaking existing calls mid-migration** → Mitigation: version flows; in-progress calls pin graph version at start (existing pattern)

## Migration Plan

1. Deploy schema migration (intents, classifications, graphJson)
2. Run seed/migration: linear → graph + starter flow
3. Release UI: flow builder + intents (feature-complete before deprecating old Call Flow page)
4. Switch `callService` to `GraphFlowEngine` when `graphJson` present; fallback to linear for unmigrated rows until cutover
5. Rollback: keep linear code path behind flag for one release

## Open Questions

- Minimum confidence threshold for intent branch vs. "clarify" node (default 0.7, operator-configurable per intent?)
- Whether operators can A/B two published flow versions (defer to later change)
