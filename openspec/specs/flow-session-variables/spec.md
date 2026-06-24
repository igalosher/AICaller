# flow-session-variables Specification

## Purpose
TBD - created by archiving change flow-design-variables. Update Purpose after archive.
## Requirements
### Requirement: Flow variable definitions
The system SHALL allow operators to define named flow-scoped variables on a flow graph, each with a unique name, type (`string`, `int`, `bool`, or `json`), and optional default value.

#### Scenario: Create integer variable
- **WHEN** an operator adds a variable named `NumOfTVs` with type `int` in the Flow Builder variables panel
- **THEN** the variable definition is stored on the flow graph draft and included when the flow is published

#### Scenario: Reject duplicate variable names
- **WHEN** an operator saves a flow with two variables named `NumOfTVs`
- **THEN** validation fails with a Hebrew error indicating duplicate variable names

### Requirement: Per-call variable values
The runtime SHALL maintain a map of flow variable values for each active call, persisted in call `contextJson`, initialized from defaults when a call starts.

#### Scenario: Initialize defaults on call start
- **WHEN** a call starts on a flow where variable `HasFiber` defaults to `false`
- **THEN** the call session context contains `variables.HasFiber === false` before any customer utterance

#### Scenario: Persist variable across turns
- **WHEN** a variable is set during turn N and the call continues to turn N+1
- **THEN** the stored value is available for decisions and speak templates on turn N+1

### Requirement: Listen node variable bindings
Operators SHALL configure optional bindings on listen nodes that assign session variable values from classification results or raw transcript text when the listen node completes.

#### Scenario: Bind TV count from entity
- **WHEN** a listen node is bound to variable `NumOfTVs` with source `entity` path `tv_count` and the customer answer is classified as `provide_tv_count` with entity `tv_count: 3`
- **THEN** session variable `NumOfTVs` is set to `3` before routing continues

#### Scenario: Bind raw text to string variable
- **WHEN** a listen node binds variable `CustomerAddress` with source `raw_text` and the customer says "רחוב הרצל 5 תל אביב"
- **THEN** `CustomerAddress` is set to that transcript text

#### Scenario: Type coercion on bind
- **WHEN** a binding targets an `int` variable and the extracted value is numeric string `"2"`
- **THEN** the variable is stored as integer `2`

### Requirement: Flow variables in speak templates
Speak nodes SHALL support template placeholders `{{variable_name}}` for defined flow variables, resolved at speak time together with existing contact templates.

#### Scenario: Speak interpolated TV count
- **WHEN** a speak node text is "מצוין, רשמתי {{NumOfTVs}} מכשירי טלוויזיה" and `NumOfTVs` is `3`
- **THEN** the AI speaks "מצוין, רשמתי 3 מכשירי טלוויזיה"

#### Scenario: Preview flow variable in builder
- **WHEN** an operator previews speak text containing `{{NumOfTVs}}` in the Flow Builder
- **THEN** preview substitutes a sample or default value for that variable

### Requirement: Variable definition validation on publish
The system SHALL validate all variable definitions before publish: unique names, valid types, defaults compatible with type, and bindings reference existing variable names.

#### Scenario: Invalid binding reference rejected
- **WHEN** a listen node binds to variable `TvCount` but no such variable is defined
- **THEN** publish is blocked with a Hebrew validation error naming the node and missing variable

