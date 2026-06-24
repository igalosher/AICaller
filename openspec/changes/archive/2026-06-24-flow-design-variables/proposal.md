## Why

The visual flow builder routes calls primarily by **intent labels**, but many qualification and sales paths depend on **structured answers** (counts, addresses, product choices) and **reference data** (channel lists, TV models, fiber coverage). Operators cannot today define reusable variables from customer answers, query pasted lookup tables, branch on those values, or speak them back—forcing hard-coded logic in code instead of configurable flow design.

## What Changes

- Add **flow-scoped session variables** with typed definitions (`string`, `int`, `bool`, `json`) that operators create and edit in the Flow Builder UI
- **Bind variables to listen nodes**: when a question is answered, classification entities or extraction rules populate the variable (e.g. `NumOfTVs` ← `provide_tv_count` entity `tv_count`)
- Add **lookup table variables**: operators paste JSON (array of objects); runtime supports queries such as **exists**, **match column/value**, and **read field** for decision routing
- Extend **decision nodes** with variable-based conditions (comparisons, lookup queries) in addition to intent-based routing
- Extend **speak nodes** to interpolate flow variables in `{{variable_name}}` templates alongside existing contact templates
- Persist variable **definitions** on the flow graph and **values** per call in `contextJson`; validate definitions at publish time
- Flow Builder UI: variables panel (create/edit/delete), bind on listen nodes, condition builder on decision edges, variable picker in speak text

## Capabilities

### New Capabilities

- `flow-session-variables`: Typed per-flow variable definitions, per-call values, listen-node bindings, speak interpolation, and publish-time validation
- `flow-lookup-tables`: JSON lookup table variables, query operators (exists, column match, field read), and decision integration

### Modified Capabilities

- `visual-flow-builder`: Variables management UI, listen bindings, decision condition editor, speak variable picker/preview
- `call-flow-configuration`: Graph runtime evaluates variable conditions and applies bindings after classification; speak templates resolve flow variables
- `conversation-classification`: Entity extraction results map to configured flow variables when listen bindings are present

## Impact

- **Server**: `graphTypes.ts` / `FlowGraph` schema extension; `graphFlowRuntime.ts` / `callService.ts` variable store and condition evaluator; `template.ts` extended for flow vars; `graphValidation.ts` for variable/lookup rules; optional `lookupQuery.ts` helper
- **Client**: `FlowBuilderPage.tsx` variables sidebar, listen node inspector bindings, decision edge condition UI, speak autocomplete for `{{var}}`
- **Data**: Flow graph JSON grows with `variables` and `lookupTables` arrays; call `contextJson` stores `variables: Record<string, unknown>`
- **Voice**: TTS speaks resolved variable values in scripted prompts (e.g. "יש לך {{NumOfTVs}} מכשירי טלוויזיה")
- **Tests**: Unit tests for lookup queries, condition evaluation, template resolution, and graph validation
