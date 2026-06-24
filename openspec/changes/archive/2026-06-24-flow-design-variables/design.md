## Context

The AICaller graph runtime (`FlowGraph`, `graphFlowEngine`, `callService.processGraphTurn`) advances calls through speak → listen → intent_route/decision nodes. Speak nodes already support contact templates (`{{customer_first_name}}`, etc.) via `resolveTemplate`. Classification returns structured entities (`tv_count`, `address`, …) but values are used ad hoc in code—not as operator-defined flow variables.

Decision nodes exist in types and validation but routing today is **intent-based** on `intent_route` nodes; `decision` nodes share the same edge model (`intentId` / `isDefault`) without variable conditions. Operators need first-class variables, JSON lookup tables, UI configuration, and runtime evaluation without per-tenant code changes.

## Goals / Non-Goals

**Goals:**

- Per-flow **variable definitions** (name, type, optional default) and per-call **values** persisted in `contextJson`
- **Listen bindings**: map classification intent + entity path → variable assignment after a listen node
- **Lookup tables**: flow-level JSON arrays; query API for exists / column equals / get field; usable in decision conditions
- **Decision routing** by variable conditions on outgoing edges (with mandatory default)
- **Speak interpolation** of flow variables in Hebrew prompts
- **Flow Builder UI** for CRUD variables, paste lookup JSON, bind listen nodes, edit decision conditions, preview speak text
- **Publish validation** for duplicate names, invalid JSON, unreachable bindings, and decision nodes without default

**Non-Goals:**

- External database or CSV import for lookup tables (paste JSON only in v1)
- Full SQL engine or JOINs across tables
- Cross-flow or global variables shared between tenants
- LLM-generated variable extraction without explicit binding (bindings use existing classifier entities or literal parsers)
- Retrofitting every Sigal MiniFlow node in seed data in this change (follow-up migration task optional)

## Decisions

### 1. Store definitions on `FlowGraph`, values on call `contextJson`

**Choice:** Extend `FlowGraph` with `variables: FlowVariableDef[]` and `lookupTables: FlowLookupTableDef[]`. Per-call `contextJson` gains `variables: Record<string, unknown>`.

**Rationale:** Definitions version with published flow; values are session state. Matches existing `lastSpokenText` pattern in graph context.

**Alternative considered:** Separate Prisma tables for variables—rejected as heavier and harder to draft/publish atomically with the graph.

### 2. Variable types: `string`, `int`, `bool`, `json`

**Choice:** Small typed set with coercion on assignment from entities.

**Rationale:** Covers TV count (`int`), yes/no (`bool`), address (`string`), and nested extraction (`json`). Lookup tables are a separate def type, not a variable type.

### 3. Listen binding model

**Choice:** Optional `bindings` on `ListenNode`: `{ variableName, source: "entity" | "intent" | "raw_text", path?: string }[]`. Primary path: `source: "entity", path: "tv_count"` when intent is `provide_tv_count`.

**Rationale:** Reuses `ClassificationResult.entities` without new ML. `raw_text` allows simple string capture when no entity exists.

**Alternative:** Per-intent global mapping in flow metadata—rejected; binding at listen node is clearer in the graph.

### 4. Lookup table shape and queries

**Choice:** `lookupTables[]` with `{ id, name, rows: object[] }` where each row is a flat JSON object. Supported condition operators on decision edges:

| Operator | Meaning |
|----------|---------|
| `lookup_exists` | Row exists where `column == value` (value from literal or variable) |
| `lookup_get` | Read `column` from first matching row into temp eval (for speak via intermediate variable optional v2) |
| `var_eq`, `var_gt`, `var_lt`, `var_gte`, `var_lte` | Compare session variable to literal |
| `var_empty` / `var_not_empty` | Presence checks |

Edges on `decision` nodes carry `condition?: FlowEdgeCondition` instead of/in addition to `intentId`. Intent-based routing remains on `intent_route` nodes.

**Rationale:** SQL-like mental model ("exists in table where column = X") without SQL parser.

**Alternative:** Embed jq expressions—rejected for operator UX and validation complexity.

### 5. Decision evaluation order

**Choice:** After listen, apply bindings → evaluate `decision` node by first matching non-default edge condition → else default edge. `intent_route` unchanged.

**Rationale:** Separates intent routing from data routing; one decision node can follow intent_route.

### 6. Template resolution

**Choice:** Extend `resolveTemplate` (or wrapper) to merge contact vars + stringified flow variables. Int/bool formatted for Hebrew TTS (`3`, `כן`/`לא`).

**Rationale:** Single `{{NumOfTVs}}` syntax consistent with existing speak templates.

### 7. UI placement

**Choice:** Flow Builder left sidebar "משתנים" tab: list variables + lookup tables; node inspector panels for listen bindings and decision edge conditions; speak textarea autocomplete for `{{`.

**Rationale:** Keeps canvas uncluttered; matches existing node-type toolbar pattern.

## Risks / Trade-offs

- **[Risk] Invalid pasted JSON breaks publish** → Mitigation: schema validation on save/publish with Hebrew errors; JSON editor with parse feedback
- **[Risk] Type coercion errors (e.g. "שלוש" → int)** → Mitigation: rely on classifier `tv_count` entity; binding failures log warning and leave variable unset; decision falls through to default
- **[Risk] Large lookup JSON in graph payload** → Mitigation: soft size limit (e.g. 500 rows / 256KB) at validation; document limit in UI
- **[Risk] Condition complexity for operators** → Mitigation: structured condition builder, not free-form expressions in v1
- **[Trade-off]** No SQL → complex multi-table logic still needs code or multiple lookup tables

## Migration Plan

1. Ship schema extensions with optional empty `variables` / `lookupTables` (backward compatible)
2. Extend `parseGraphContext` / `serializeGraphContext` for `variables` object
3. Deploy server runtime + validation before UI so API accepts new graph shape
4. Deploy Flow Builder UI
5. Optional: add example `NumOfTVs` binding to Sigal qualification listen nodes in seed script

**Rollback:** Published graphs without variable defs behave as today; remove UI fields and ignore extra JSON keys.

## Open Questions

- Should `lookup_get` results be writable to a session variable in v1, or only boolean exists checks on edges? (Proposal: exists + compare column to variable in v1; `lookup_get` → assign variable as fast follow)
- Hebrew formatting for ints > 10 in speak (digits vs words)—default to digits for v1
- Maximum lookup table size for production—confirm with operators after first pilot
