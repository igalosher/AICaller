## ADDED Requirements

### Requirement: Auto-ensure variables for bindings
When a flow graph is enhanced for save, load, or publish, the system SHALL add missing flow variable definitions required by `variableBindings` and by convention for `listen_address` (`CustomerAddress`) and `listen_tv` (`NumOfTVs`).

#### Scenario: CustomerAddress added automatically
- **WHEN** a graph has a binding to `CustomerAddress` on `listen_address` but `CustomerAddress` is missing from `variables`
- **THEN** enhancement adds `{ name: "CustomerAddress", type: "string", defaultValue: "" }` before validation

#### Scenario: Publish succeeds after graph edit
- **WHEN** an operator removes and re-adds address listen steps leaving only `NumOfTVs` in the variables panel
- **THEN** save or publish auto-adds `CustomerAddress` and validation passes

## MODIFIED Requirements

### Requirement: Variable definition validation on publish
The system SHALL validate all variable definitions before publish: unique names, valid types, defaults compatible with type, and bindings reference existing variable names. Enhancement SHALL run before validation so auto-ensured variables satisfy bindings.

#### Scenario: Invalid binding reference rejected
- **WHEN** a listen node binds to variable `TvCount` but no such variable is defined and it cannot be auto-ensured
- **THEN** publish is blocked with a Hebrew validation error naming the node and missing variable
