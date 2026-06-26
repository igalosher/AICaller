## Why

Outbound sales today follow a published **flow graph** with LLM used at specific nodes. Operators want an alternative **Agent Mode**: an autonomous Sigal that pursues a defined mission within hard limits, uses the product catalog, handles rejection politely, and improves from operator-reviewed corrections — without redrawing the flow for every conversational tweak.

## What Changes

- **Flow Mode / Agent Mode switch** in the header next to the YES AI Caller logo; persisted in settings; new calls use the selected mode
- **Agent screen** (nav tab **סוכן / Agent**): mission, hard limits, policies, approved learning examples, publish/save
- **Agent runtime** on connected calls when mode is `agent`: catalog-grounded LLM turns with per-call memory (rejections, qualification notes) instead of graph/staged routing
- **Response review on Calls screen**: operators correct an AI line → saved as an approved example for future agent turns
- **Call management unchanged**: same dial, monitor, transcript, hang up; calls record which mode was used

## Capabilities

### New Capabilities

- `autonomous-sales-agent`: Agent config, runtime, example library, conversation-mode setting

### Modified Capabilities

- `operator-ui`: Mode switch, Agent tab, AI response correction on call detail
- `hebrew-voice-ai`: Agent-mode voice turns alongside existing flow-mode path
- `call-flow-configuration`: Global conversation mode does not replace flow publish; flow remains used in Flow Mode only

## Impact

- **Database**: `AppSettings.conversationMode`, `AppSettings.agentConfigJson`, `Call.conversationMode`, `AgentResponseExample` model
- **Server**: `agentRuntime`, `/api/agent/*`, `/api/settings/conversation-mode`
- **Client**: `AgentPage`, `ConversationModeSwitch`, Calls correction UI
