## Why

Operators tune the autonomous Sigal agent over time, but today **שמור הגדרות סוכן** overwrites the only copy with no history, and call-time corrections immediately become approved examples with no way to batch-review instruction changes before they affect live calls. We need safe iteration: versioned config snapshots and a **draft queue** fed by per-turn feedback during calls.

## What Changes

- **Version history** for agent configuration: each explicit save creates an immutable version; operators can browse, preview, and **restore** a previous version (which becomes the new active config and a new version entry)
- **Per-turn agent feedback** on the Calls screen (agent-mode calls): operators can submit feedback on any AI transcript line — corrected response **and/or** suggested instruction updates (mission, limits, policies)
- **Draft-only by default**: call-time feedback creates **pending drafts**, not live config or approved examples, until reviewed on the **סוכן** page
- **Draft review inbox** on Agent page: list pending drafts with source call context; **approve** (merges into config and/or example library, triggers version save) or **discard**
- **Gender-aware TTS niqqud**: expand homograph/addressee adaptation so ElevenLabs gets niqqud hints from `contact.sex` (slash forms, `{{g:}}` markers, common זכר/נקבה pairs) without changing transcripts
- Existing immediate `createExample` flow on Calls is replaced or extended so examples from calls land as drafts unless explicitly approved on Agent page

## Capabilities

### New Capabilities

- `agent-config-versioning`: Immutable version snapshots, list/restore API, and UI version picker on Agent page

### Modified Capabilities

- `autonomous-sales-agent`: Draft instruction feedback pipeline, approval workflow, runtime continues to use only published config + approved examples
- `operator-ui`: Call-step feedback UI, Agent page draft inbox and version history controls
- `hebrew-gender-tts`: Expanded niqqud registry, slash-form resolution, `{{g:}}` in TTS pipeline

## Impact

- **Database**: new `AgentConfigVersion` model; extend or add `AgentInstructionDraft` (and/or mark `AgentResponseExample.approved` default false for call-origin drafts)
- **Server**: version CRUD in `agentConfigService`, draft APIs in `/api/agent/*`, approval merge logic
- **Client**: Agent page version dropdown + restore; Calls page expanded correction modal with instruction feedback; pending-drafts section on Agent page
- **Runtime**: no change to live agent behavior until operator approves drafts on Agent page
