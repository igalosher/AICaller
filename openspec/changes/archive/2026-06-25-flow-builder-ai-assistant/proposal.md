## Why

Editing conversation flows in **בניית זרימה** is powerful but tedious: adding stages, rewiring branches, and tuning Hebrew speak text requires many manual canvas and inspector steps. Operators who think in natural language ("הוסיפי שאלה על מחיר אחרי ספק") need an assistant that applies those edits directly to the draft graph while they watch the canvas update.

## What Changes

- **AI button** on the Flow Builder toolbar opens a floating Hebrew chat panel docked over the canvas
- **Natural-language flow editing**: Operators describe changes (add stages, rewire paths, change speak wording, add variables/bindings within scope); the assistant returns structured graph patches applied to the current draft
- **Scope guardrails**: The assistant only accepts flow-relevant requests (nodes, edges, speak text, variables, side flows, bindings, conditions). Off-topic or unsafe asks are refused in Hebrew with a short explanation
- **Live visual feedback**: After each successful edit, the canvas selects and focuses affected node(s) so changes are visible as they land (reuse existing `focus`/fit-view behavior)
- **Undo stack in the AI panel**: **בטל שינוי אחרון** reverts the last AI-applied patch; up to **20** levels; manual edits outside the assistant do not consume undo slots but clear the AI undo stack when the draft diverges
- **Validation-aware**: AI patches run through the same graph validation as manual saves; invalid proposals are rejected with Hebrew errors shown in the panel

## Capabilities

### New Capabilities

- `flow-builder-ai-assistant`: Server-side flow-edit agent, patch schema, scope filtering, and undo history contract between client and API

### Modified Capabilities

- `visual-flow-builder`: AI assistant button, floating panel UI, live focus on changed nodes, undo control integrated with draft graph state
- `operator-ui`: Flow Builder screen includes the AI assistant entry point and Hebrew RTL panel chrome

## Impact

- **Server**: New authenticated API route (e.g. `POST /api/call-flows/:id/ai-edit`) invoking LLM with current draft graph + intent catalog; returns validated patch + summary; optional undo token / snapshot stack
- **Client**: `FlowBuilderPage` — AI button, floating panel component, draft patch application, focus animation on changed node ids, undo button (max 20)
- **Shared**: Flow graph patch types (add/update/remove nodes/edges, speak text, variables); reuse `validateFlowGraph` and existing draft save path
- **Dependencies**: Existing OpenAI (or configured AI provider) from settings; no change to published-call runtime until operator clicks **פרסם זרימה**
