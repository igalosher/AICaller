## 1. Schema & migration

- [x] 1.1 Add `AgentConfigVersion` model (versionNumber, configJson, label, source, createdAt)
- [x] 1.2 Add `AgentInstructionDraft` model (status, kind, payloadJson, callId, segmentId, operatorNote)
- [x] 1.3 Prisma migration + backfill version `1` from existing `agentConfigJson` when history empty

## 2. Server — versioning

- [x] 2.1 Extend `saveAgentConfig` to append version row on every save
- [x] 2.2 Implement `listAgentVersions`, `getAgentVersion`, `restoreAgentVersion`
- [x] 2.3 Add routes `GET /agent/versions`, `GET /agent/versions/:id`, `POST /agent/versions/:id/restore`

## 3. Server — drafts

- [x] 3.1 Implement `createAgentDraft`, `listPendingDrafts`, `approveAgentDraft`, `discardAgentDraft`
- [x] 3.2 Approval: `response_example` → approved `AgentResponseExample`; `config_patch` → merge + version with `draft_approval`
- [x] 3.3 Add routes `GET/POST /agent/drafts`, `POST /agent/drafts/:id/approve`, `POST /agent/drafts/:id/discard`
- [x] 3.4 Change Calls correction path to create draft instead of immediate `createAgentExample` with `approved: true`

## 4. Client — Agent page

- [x] 4.1 Version history UI: list, preview, restore with confirmation
- [x] 4.2 Pending drafts inbox: list, approve, discard with Hebrew labels
- [x] 4.3 Show current version number near **שמור הגדרות סוכן**

## 5. Client — Calls page

- [x] 5.1 Expand agent feedback modal: instruction target (mission/limits/policies), patch text, operator note
- [x] 5.2 Submit via draft API; show Hebrew confirmation that review happens on **סוכן**

## 6. Types, API client & specs sync

- [x] 6.1 Add TypeScript types and `agentApi` methods for versions and drafts
- [x] 6.2 Sync `openspec/specs/agent-config-versioning`, `autonomous-sales-agent`, `operator-ui`, `hebrew-gender-tts` after implementation

## 7. Hebrew gender TTS (niqqud for ElevenLabs)

- [x] 7.1 Expand `adaptHebrewTextForTts`: `{{g:}}`, slash forms, addressee word niqqud
- [x] 7.2 Agent opening uses `{{g:מעוניין|מעוניינת}}`; `prepareAgentOpening` resolves markers
- [x] 7.3 Extend `test-hebrew-gender-tts` for slash forms and marker-in-TTS path
