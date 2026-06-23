## ADDED Requirements

### Requirement: Graphical flow canvas
The system SHALL provide a visual flow builder where operators create and edit conversation flows as a directed graph with nodes and edges.

#### Scenario: Add a speak node
- **WHEN** an operator drags a "דיבור" (speak) node onto the canvas and enters Hebrew prompt text
- **THEN** the node is saved as part of the flow graph with a unique id

#### Scenario: Connect nodes with edges
- **WHEN** an operator connects a decision node output "כן" to a target speak node
- **THEN** the edge is stored with label and source/target node ids

### Requirement: Decision and branch nodes
The flow builder SHALL support decision nodes with multiple labeled outgoing edges (if/else style), including intent-based branches and a mandatory default/fallback edge.

#### Scenario: Intent branch configuration
- **WHEN** an operator adds an "ניתוב לפי כוונה" node and maps intent `price_objection` to edge A and `not_interested` to edge B
- **THEN** the runtime routes customer speech classified as `price_objection` to edge A

#### Scenario: Default branch required
- **WHEN** an operator saves a decision node without a default edge
- **THEN** validation fails with a Hebrew error requiring a fallback path

### Requirement: Flow validation before publish
The system SHALL validate flows before activation: single start node, all nodes reachable, end nodes present, no orphan edges, speak nodes have non-empty text.

#### Scenario: Invalid flow rejected
- **WHEN** an operator publishes a graph with no path from start to any end node
- **THEN** publish is blocked and validation errors are listed in Hebrew

### Requirement: Flow versioning and publish
Operators SHALL save draft graphs and publish an active version; calls started after publish use the new version; in-progress calls retain the version at call start.

#### Scenario: Publish new flow version
- **WHEN** an operator clicks "פרסם זרימה" on a validated graph
- **THEN** the version increments and new outbound calls use the published graph

### Requirement: Template variables in speak nodes
Speak nodes SHALL support template variables including `{{customer_full_name}}`, `{{customer_first_name}}`, and `{{packet_name}}` with inline preview.

#### Scenario: Preview speak text
- **WHEN** an operator edits speak node text containing `{{customer_first_name}}`
- **THEN** preview shows the variable substituted with sample data
