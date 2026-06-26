## Context

Agent configuration lives in `AppSettings.agentConfigJson` as a single JSON blob. `saveAgentConfig` overwrites it with an `updatedAt` timestamp. Call corrections via `agentApi.createExample` create `AgentResponseExample` rows with `approved: true` immediately, so operators cannot batch-review changes before they affect the LLM prompt.

Operators want two safety rails: **version history** when saving agent settings, and **draft feedback** from live calls that only promotes to production after review on the **סוכן** page.

## Goals / Non-Goals

**Goals:**

- Immutable version snapshot on every **שמור הגדרות סוכן** (and on restore-from-version)
- List, preview, and restore previous agent config versions from Agent page
- Per AI transcript line on agent calls: submit feedback that creates **drafts** (response example and/or instruction patch)
- Agent page **draft inbox**: approve (merge + new version) or discard
- Live agent runtime unchanged until approval — only published config + approved examples

**Non-Goals:**

- Git-style branching or diff merge between versions
- Auto-LLM rewriting of mission/limits from free-text feedback (operator edits draft text before approve)
- Versioning for flow graph or conversation mode settings
- Multi-user audit (single operator deployment assumed)

## Decisions

### 1. `AgentConfigVersion` table

Store full config snapshot per save:

| Field | Purpose |
|-------|---------|
| `id` | cuid |
| `versionNumber` | monotonic int per deployment |
| `configJson` | full `AgentConfig` snapshot |
| `label` | optional operator note |
| `source` | `manual_save` \| `restore` \| `draft_approval` |
| `createdAt` | timestamp |

`AppSettings.agentConfigJson` remains the **active** config pointer (fast read path). Versions are append-only history.

**Alternative:** version-only storage with `activeVersionId` pointer — rejected; extra join on every agent turn.

### 2. `AgentInstructionDraft` table

Unified draft queue for call feedback:

| Field | Purpose |
|-------|---------|
| `id` | cuid |
| `status` | `pending` \| `approved` \| `discarded` |
| `kind` | `response_example` \| `config_patch` |
| `payloadJson` | kind-specific: example fields or `{ field, appendText, replaceText? }` |
| `callId`, `segmentId` | provenance |
| `operatorNote` | free-text why |
| `createdAt` | |

**Alternative:** reuse `AgentResponseExample` with `approved: false` only — insufficient for mission/limits/policy patches; keep examples for approved library, drafts table for inbox.

### 3. Call feedback UX

Expand existing **תקן תגובה לסוכן** modal on Calls:

- **Corrected response** (optional if only instruction feedback)
- **Instruction feedback** (optional): target field (`mission` \| `limits` \| `policies`) + text to append or suggested replacement
- Submit → `POST /api/agent/drafts` (never touches live config)

### 4. Approval merge

On **approve** draft:

- `response_example` → create `AgentResponseExample` with `approved: true`, mark draft approved
- `config_patch` → apply patch to active config in memory, `saveAgentConfig` (creates new version with `source: draft_approval`)

Approve may bundle multiple pending drafts in one review action (v1: one draft at a time for simplicity).

### 5. Restore version

`POST /api/agent/versions/:id/restore` copies snapshot to active config, writes **new** version row (`source: restore`) so history is never rewritten.

### 6. API surface

```
GET  /api/agent/versions
GET  /api/agent/versions/:id
POST /api/agent/versions/:id/restore
GET  /api/agent/drafts?status=pending
POST /api/agent/drafts
POST /api/agent/drafts/:id/approve
POST /api/agent/drafts/:id/discard
```

Existing `POST /api/agent/examples` from Calls redirected to draft creation (`response_example` kind) instead of immediate approve.

## Risks / Trade-offs

- **[Risk] Draft payload merge conflicts** (two patches to same field) → Mitigation: show combined preview on approve; operator edits active config before final save
- **[Risk] Version table growth** → Mitigation: soft cap (e.g. keep last 50) in future; not in v1
- **[Risk] Operators expect immediate learning** → Mitigation: clear Hebrew copy: "נשמר כטיוטה — יחול אחרי אישור בדף סוכן"
- **[Trade-off]** Restore creates a new version rather than rewinding — clearer audit trail, uses more rows

## Migration Plan

1. Prisma migration: `AgentConfigVersion`, `AgentInstructionDraft`
2. Backfill version `1` from current `agentConfigJson` on first deploy if versions empty
3. Deploy server + client; existing approved examples unchanged
4. Calls UI copy update for draft behavior

## Open Questions

- Should instruction feedback support a fourth target (`openingTemplate`)? **Defer** — mission/limits/policies sufficient for v1
- Bulk approve all pending drafts? **Defer** — single-draft approve in v1
