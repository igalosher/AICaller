# flow-side-flows Specification

## Purpose
Configurable off-script mini-flows triggered by customer intent during a listen checkpoint, without advancing the main qualification graph.

## Requirements
### Requirement: Side flow definitions on graph
The flow graph SHALL support a `sideFlows` array where each entry maps an `intentId` to a disconnected `entryNodeId` (speak node) that is not required to be reachable from `startNodeId` via main edges.

#### Scenario: Configure small-talk side flow
- **WHEN** an operator adds side flow intent `small_talk` with entry speak node `side_small_talk`
- **THEN** the definition is stored on the draft graph and validated at publish

### Requirement: Side flow speak chain
Entering a side flow SHALL execute a chain of speak nodes following auto edges from the entry node until no further speak node exists or `returnsToMain` is set on the last speak node.

#### Scenario: Run side flow speak chain
- **WHEN** the customer says "מה שלומך?" at a listen checkpoint and side flow `small_talk` is configured
- **THEN** the runtime speaks the side flow chain without advancing the main route

### Requirement: Return to main after side flow
When the final speak node in a side chain has `returnsToMain: true`, the runtime SHALL restore the saved main listen checkpoint and repeat the last main-stage question.

#### Scenario: Small talk then repeat qualification question
- **WHEN** side flow ends on a speak node with `returnsToMain` and main checkpoint was `listen_inet`
- **THEN** the AI speaks the side flow reply followed by the internet-type question and remains on `listen_inet`

### Requirement: Side flow validation
Publish validation SHALL require each side flow entry to be a speak node, contain at least one speak in the chain, and either mark `returnsToMain` on the last speak or connect the chain back to a listen node.

#### Scenario: Reject side flow without return
- **WHEN** an operator publishes a side flow whose last speak node lacks `returnsToMain` and does not connect to a listen node
- **THEN** publish is blocked with a Hebrew error naming the side flow
