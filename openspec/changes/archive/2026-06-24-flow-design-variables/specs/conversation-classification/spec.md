## ADDED Requirements

### Requirement: Entity-to-variable mapping via listen bindings
When a flow listen node defines variable bindings, the classification pipeline SHALL expose extracted entities in a form the runtime can assign to the bound variable names without additional hard-coded mapping per flow.

#### Scenario: TV count entity available for binding
- **WHEN** customer speech is classified as `provide_tv_count` with entity `tv_count: 4`
- **THEN** classification metadata includes `entities.tv_count` as number `4` for binding to `NumOfTVs`

#### Scenario: Address entity available for binding
- **WHEN** customer speech is classified as `provide_address` with entity `address: "רחוב בן גוריון 10"`
- **THEN** classification metadata includes `entities.address` for binding to a string flow variable

## MODIFIED Requirements

### Requirement: Classification drives flow navigation
The graph flow runtime SHALL use the latest classification result to select the next node when the current node is `listen` or `intent_route`, and SHALL apply listen bindings before evaluating `decision` nodes that route on variables or lookups.

#### Scenario: Route on intent
- **WHEN** the active node is `listen` and classification returns `not_interested`
- **THEN** the engine follows the edge configured for `not_interested`

#### Scenario: Bind variable before decision
- **WHEN** the active node is `listen` with binding to `NumOfTVs`, classification returns `provide_tv_count` with `tv_count: 2`, and the next node is `decision`
- **THEN** `NumOfTVs` is set to `2` before decision edges are evaluated
