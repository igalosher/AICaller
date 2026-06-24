## 1. Schema and types

- [x] 1.1 Extend `FlowGraph` in `graphTypes.ts` with `variables`, `lookupTables`, `FlowVariableDef`, `FlowLookupTableDef`, `FlowEdgeCondition`, and listen `bindings`
- [x] 1.2 Extend graph context types (`graphFlowRuntime.ts`) with `variables: Record<string, unknown>` in parse/serialize helpers
- [x] 1.3 Add shared client types mirroring server flow variable/lookup/condition shapes

## 2. Lookup and condition evaluation

- [x] 2.1 Implement `lookupQuery.ts`: parse rows, `lookup_exists`, column listing, size checks
- [x] 2.2 Implement `conditionEvaluator.ts`: `var_eq`, `var_gt`, `var_lt`, `var_gte`, `var_lte`, `var_empty`, `var_not_empty`, `lookup_exists`
- [x] 2.3 Implement `variableBinding.ts`: apply listen bindings from classification entities, intent, or raw text with type coercion
- [x] 2.4 Unit tests for lookup queries, condition evaluation, and binding coercion

## 3. Graph validation

- [x] 3.1 Extend `graphValidation.ts`: unique variable/table names, valid defaults, binding references, lookup JSON shape, size limits
- [x] 3.2 Validate decision nodes: at least one default edge; non-default edges have valid conditions
- [x] 3.3 Hebrew validation error messages for all new rules
- [x] 3.4 Unit tests for validation cases (duplicate names, bad JSON, dangling bindings)

## 4. Runtime integration

- [x] 4.1 Initialize session variables from flow defaults on call start in `callService.ts`
- [x] 4.2 After classification on listen nodes: apply bindings before routing
- [x] 4.3 Extend `graphFlowEngine.advanceByClassification` (or sibling) to evaluate decision edges by conditions, not only intents
- [x] 4.4 Extend `resolveTemplate` / `speakFromNode` to merge flow variables into speak text
- [x] 4.5 Integration test: listen → bind `NumOfTVs` → decision branch → speak with `{{NumOfTVs}}`

## 5. API and persistence

- [x] 5.1 Ensure `flowGraphService` round-trips new graph fields on draft save and publish
- [x] 5.2 Verify API responses include variables/lookupTables for Flow Builder load
- [x] 5.3 Backward compatibility: graphs without new fields load and run unchanged

## 6. Flow Builder UI — variables panel

- [x] 6.1 Add "משתנים" sidebar tab: list/create/edit/delete flow variables (name, type, default)
- [x] 6.2 Add lookup table CRUD with JSON textarea, parse feedback, row count, column preview
- [x] 6.3 Wire panel state to graph draft save payload

## 7. Flow Builder UI — node editors

- [x] 7.1 Listen node inspector: binding list UI (variable, source, entity path)
- [x] 7.2 Decision node / edge inspector: structured condition builder (operator, variable, literal, lookup table/column)
- [x] 7.3 Speak node: variable autocomplete/picker for `{{var}}`; extend preview with sample flow values
- [x] 7.4 Show validation errors from publish API for variable/lookup issues

## 8. Documentation and seed (optional)

- [x] 8.1 Add example `NumOfTVs` variable + listen binding on Sigal TV-count listen node in seed or migration script
- [x] 8.2 Add example lookup table (e.g. channels) and one decision branch in seed graph (optional pilot)

## 9. End-to-end verification

- [x] 9.1 Manual test in Flow Builder: create variable, bind listen, branch decision, speak template, publish
- [x] 9.2 Manual test on live call: answer TV count question, verify variable-driven branch and spoken interpolation
- [x] 9.3 Run existing graph flow tests; fix regressions
