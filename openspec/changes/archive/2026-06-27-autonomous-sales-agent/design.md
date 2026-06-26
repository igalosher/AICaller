## Context

AICaller already has catalog tools, Sigal persona prompts, intent classification, and a visual flow runtime. Agent Mode reuses telephony, STT/TTS, and product knowledge while replacing **graph/staged turn routing** with a single **agent loop** bounded by operator-configured mission and limits.

## Goals

- Toggle between Flow Mode and Agent Mode without changing call-management UX
- Agent speaks from mission + policies + catalog tools + approved examples
- Operators correct bad AI lines from call review; corrections feed the example library
- Flow builder and published graph remain the source of truth for Flow Mode only

## Non-Goals (v1)

- Fine-tuning on seller recordings
- Automatic ingestion of external call recordings
- Replacing intent management or flow builder

## Architecture

```
Header switch (flow | agent)
        │
        ▼
AppSettings.conversationMode
        │
        ▼
startCall / test-start ──▶ Call.conversationMode snapshot
        │
        ▼
processCustomerTurn
   ├─ flow ──▶ existing graph/staged/linear
   └─ agent ─▶ agentRuntime.processAgentTurn
                    ├─ agent config (mission, limits, policies)
                    ├─ product catalog (existing tools)
                    ├─ retrieve approved examples
                    ├─ call memory in contextJson.agent
                    └─ generateAgentReply (LLM)
```

## Agent memory (per call, `contextJson.agent`)

| Field | Purpose |
|-------|---------|
| `rejectionCount` | Stop after configured threshold |
| `tvCount` | Optional qualification |
| `internetType` | Optional qualification |
| `address` | Optional qualification |
| `lastTopic` | Debugging / future RAG |

## Example library

`AgentResponseExample`: `customerText`, optional `aiResponseBad`, `correctedText`, `approved`, optional `callId`/`segmentId`.

Retrieval v1: token overlap scoring on Hebrew text; top 3 approved examples injected into the agent prompt.

## UI

- **Mode switch**: segmented control RTL, near logo; persists via API
- **Agent tab**: three columns on desktop — Mission | Limits & Policies | Learning examples; mobile stacks
- **Calls**: on AI transcript lines (agent-mode calls), **תקן תגובה** opens correction modal

## Risks

| Risk | Mitigation |
|------|------------|
| Hallucinated prices | Catalog-only system prompt + existing product tools |
| Agent ignores opt-out | Hard limit text + `detectOutcome` on הסר |
| Example pollution | `approved` flag; operator saves explicitly |

## Migration

SQLite migration adds nullable/default columns; existing calls default to `flow`.
