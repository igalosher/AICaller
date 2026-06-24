## ADDED Requirements

### Requirement: Flow variables management panel
The Flow Builder SHALL provide a variables management panel where operators create, edit, and delete flow variable definitions (name, type, default) and lookup table definitions.

#### Scenario: Add variable from sidebar
- **WHEN** an operator opens the "משתנים" panel and clicks add variable
- **THEN** a form collects name, type, and optional default and saves to the draft graph

#### Scenario: Delete unused variable
- **WHEN** an operator deletes a variable not referenced by any node binding or decision condition
- **THEN** the variable is removed from the draft graph

### Requirement: Listen node binding editor
The Flow Builder SHALL expose per-listen-node binding configuration linking variables to entity paths, intents, or raw transcript text.

#### Scenario: Configure TV count binding
- **WHEN** an operator selects a listen node and adds binding `NumOfTVs` ← entity `tv_count`
- **THEN** the binding is stored on that listen node in the graph JSON

### Requirement: Decision condition editor
The Flow Builder SHALL provide a structured editor for decision node outgoing edge conditions, including variable comparisons and lookup_exists rules, in addition to intent-based routing on intent_route nodes.

#### Scenario: Configure lookup branch edge
- **WHEN** an operator edits a decision node edge and sets condition `lookup_exists` on table `TvModels` column `model` equals variable `TvModel`
- **THEN** the edge stores the condition for runtime evaluation

#### Scenario: Variable picker in condition builder
- **WHEN** an operator builds a `var_gte` condition
- **THEN** the UI offers a dropdown of defined flow variables and a literal value input

### Requirement: Speak node variable autocomplete
Speak node text editors SHALL offer autocomplete or picker for `{{flow_variable}}` placeholders alongside existing contact template variables.

#### Scenario: Insert variable into speak text
- **WHEN** an operator selects `NumOfTVs` from the variable picker while editing speak text
- **THEN** `{{NumOfTVs}}` is inserted at the cursor position

## MODIFIED Requirements

### Requirement: Decision and branch nodes
The flow builder SHALL support decision nodes with multiple labeled outgoing edges (if/else style), including intent-based branches on intent_route nodes, variable-based conditions and lookup queries on decision nodes, and a mandatory default/fallback edge.

#### Scenario: Intent branch configuration
- **WHEN** an operator adds an "ניתוב לפי כוונה" node and maps intent `price_objection` to edge A and `not_interested` to edge B
- **THEN** the runtime routes customer speech classified as `price_objection` to edge A

#### Scenario: Variable branch configuration
- **WHEN** an operator adds a "החלטה" node with edge A condition `var_gte NumOfTVs 2` and edge B as default
- **THEN** the runtime routes to edge A when session variable `NumOfTVs` is 2 or greater, otherwise edge B

#### Scenario: Default branch required
- **WHEN** an operator saves a decision node without a default edge
- **THEN** validation fails with a Hebrew error requiring a fallback path

### Requirement: Template variables in speak nodes
Speak nodes SHALL support template variables including `{{customer_full_name}}`, `{{customer_first_name}}`, `{{packet_name}}`, and defined flow session variables, with inline preview.

#### Scenario: Preview speak text
- **WHEN** an operator edits speak node text containing `{{customer_first_name}}` and `{{NumOfTVs}}`
- **THEN** preview shows both contact and flow variables substituted with sample data
