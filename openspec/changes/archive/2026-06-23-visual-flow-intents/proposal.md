## Why

The alpha caller uses a linear stage list and free-form LLM replies. Operators cannot visually design branching conversations, cannot see or correct how customer speech is classified, and the AI does not reliably route calls based on detected intents (e.g., price objection vs. channel question vs. close). YES sales require channel-level Q&A and decision trees—operators need control over flow logic and intent mapping without editing code.

## What Changes

- Add a **visual flow builder** (graph editor) with nodes for speech, decisions (if/else), intent branches, and end states
- Ship a **default YES starter flow** covering greeting → qualification → pitch → objections → close, with branches for common intents
- Add **intent recognition and classification** on every customer utterance during calls (primary intent, confidence, entities)
- Add a dedicated **Intent Management** screen to define intents, view example phrases, and edit mappings/training phrases operators can tune
- **BREAKING**: Replace linear-only call flow execution with a graph runtime that advances based on classified intents and decision nodes (linear stages remain importable/migratable)
- Extend product Q&A so customers can ask about **specific channels** by name and about channel packages from the YES catalog
- Store classified utterances and intent labels on call transcripts for review and tuning

## Capabilities

### New Capabilities

- `visual-flow-builder`: Graphical editor for conversation flows—nodes, edges, if/else decisions, intent-based branches, validation, publish/version
- `intent-management`: Intent catalog, utterance-to-intent mapping UI, editable examples, confidence thresholds, operator tuning without code
- `conversation-classification`: Real-time and post-call classification of customer speech (intent, entities, channel mentions), linked to transcript segments

### Modified Capabilities

- `call-flow-configuration`: Graph-based flows, decision nodes, starter template flow, migration from linear stages
- `hebrew-voice-ai`: Intent-driven navigation through the flow graph; channel-specific and per-channel Q&A from catalog
- `sales-configuration`: Structured channel lookup API for AI (single channel, package membership, descriptions)
- `operator-ui`: New Flow Builder and Intent Management screens; call review shows intent labels per utterance

## Impact

- **Client**: New React pages/components (flow canvas, intent editor), likely a graph library (e.g., React Flow)
- **Server**: Flow graph schema (JSON/SQLite), intent catalog tables, classification service (LLM + rules), runtime engine replacing `CallFlowEngine` linear advance
- **Voice pipeline**: After STT, run intent classification before LLM reply; pass active flow node + intent to select next node and response template
- **Database**: Prisma migrations for `FlowGraph`, `Intent`, `IntentExample`, `UtteranceClassification`
- **Existing alpha**: Current `CallFlowPage` linear editor superseded or embedded in visual builder; backward compatibility via import of linear stages to graph
