## ADDED Requirements

### Requirement: Deep-link node focus
The Flow Builder SHALL accept a `focus` query parameter (node id) on load. When present and the node exists in the active draft graph, the builder SHALL select that node and bring it into view (center/fit).

#### Scenario: Open builder with focus param
- **WHEN** an operator navigates to `/flow-builder?focus=speak_address`
- **THEN** node `speak_address` is selected in the inspector and visible on the canvas

#### Scenario: Unknown focus node
- **WHEN** `focus` references a node id not in the current graph
- **THEN** the builder loads normally and displays a Hebrew message that the node was not found
