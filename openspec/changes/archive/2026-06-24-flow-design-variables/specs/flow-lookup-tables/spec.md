## ADDED Requirements

### Requirement: Lookup table definitions
The system SHALL allow operators to define lookup tables on a flow graph by pasting JSON arrays of objects, each table with a unique name and validated row structure.

#### Scenario: Create lookup table from JSON
- **WHEN** an operator pastes JSON `[{"model":"LG55","tier":"premium"},{"model":"Samsung32","tier":"basic"}]` into lookup table `TvModels` in the Flow Builder
- **THEN** the table is stored on the flow graph with parsed rows available at runtime

#### Scenario: Reject invalid lookup JSON
- **WHEN** an operator saves lookup table content that is not a JSON array of objects
- **THEN** validation fails with a Hebrew error describing the JSON parse or shape problem

### Requirement: Lookup exists query
The runtime SHALL evaluate `lookup_exists` conditions: true when at least one row in the named table has a column equal to a configured literal or session variable value.

#### Scenario: Channel exists in catalog table
- **WHEN** decision edge condition is `lookup_exists` on table `Channels` where column `name` equals variable `RequestedChannel` and a row exists with `name` matching that value
- **THEN** the runtime follows that decision edge

#### Scenario: No matching row uses default
- **WHEN** `lookup_exists` condition is false for all non-default edges on a decision node
- **THEN** the runtime follows the default edge

### Requirement: Lookup column comparison for routing
Decision conditions SHALL support comparing a lookup table column to a literal or variable (`var_eq`, `var_gt`, `var_lt`, `var_gte`, `var_lte`, `var_empty`, `var_not_empty`) for branching without requiring a matching intent.

#### Scenario: Branch on TV count threshold
- **WHEN** decision edge condition is `var_gte` on variable `NumOfTVs` with literal `2`
- **THEN** the edge is taken when `NumOfTVs` is 2 or greater

#### Scenario: Branch on empty address
- **WHEN** decision edge condition is `var_empty` on variable `CustomerAddress`
- **THEN** the edge is taken when the variable is unset or empty string

### Requirement: Lookup tables in Flow Builder UI
Operators SHALL create, edit, and delete lookup tables in the Flow Builder with a JSON editor, row count preview, and column name listing derived from the first row.

#### Scenario: Preview lookup columns
- **WHEN** an operator saves valid lookup JSON
- **THEN** the UI displays detected column names for use in decision condition builder dropdowns

### Requirement: Lookup size limits
The system SHALL enforce configurable maximum lookup table size at publish time (row count and serialized byte size) and reject oversized tables with a Hebrew error.

#### Scenario: Oversized table blocked
- **WHEN** a lookup table exceeds the configured size limit
- **THEN** publish is blocked before the table is activated for calls
