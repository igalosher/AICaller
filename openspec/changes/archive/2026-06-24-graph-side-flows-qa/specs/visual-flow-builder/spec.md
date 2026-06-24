## ADDED Requirements

### Requirement: Side flows management panel
The Flow Builder SHALL provide a "זרימות צד" tab where operators define side flows mapping intent id to entry speak node id and optional label.

#### Scenario: Add side flow in builder
- **WHEN** an operator adds side flow intent `small_talk` pointing to speak node `side_small_talk`
- **THEN** the side flow is stored on the draft graph without requiring a canvas edge from the main path

### Requirement: Returns to main on speak nodes
Speak node inspectors SHALL expose a `returnsToMain` checkbox for side-flow and interrupt reply nodes.

#### Scenario: Enable return to main
- **WHEN** an operator enables "חזרה לזרימה הראשית" on a side-flow speak node
- **THEN** the node is saved with `returnsToMain: true` for runtime checkpoint restore

## MODIFIED Requirements

### Requirement: Flow validation before publish
The system SHALL validate flows before activation: single start node, all main-path nodes reachable, end nodes present, no orphan edges, speak nodes have non-empty text, side flow definitions valid, and disconnected side-flow speak nodes exempt from main reachability.

#### Scenario: Invalid flow rejected
- **WHEN** an operator publishes a graph with no path from start to any end node
- **THEN** publish is blocked and validation errors are listed in Hebrew

#### Scenario: Side flow nodes exempt from reachability
- **WHEN** a speak node is only reachable via a side flow entry and the side flow is valid
- **THEN** publish is not blocked for that node's disconnect from `startNodeId`

## REMOVED Requirements

### Requirement: Linear import from flow builder
**Reason**: Graph-first editing replaced one-click linear import; staged JSON remains for legacy runtime only.
**Migration**: Operators edit the published graph directly or restore from a previous published version.
