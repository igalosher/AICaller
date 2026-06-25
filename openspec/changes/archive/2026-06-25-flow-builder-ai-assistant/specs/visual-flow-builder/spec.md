## ADDED Requirements

### Requirement: AI assistant panel on flow canvas
The Flow Builder SHALL provide a toolbar control (e.g. **AI** / **עוזר AI**) that opens a floating, draggable Hebrew RTL chat panel over the canvas for natural-language flow editing.

#### Scenario: Open assistant panel
- **WHEN** an operator clicks the AI button on the flow builder toolbar
- **THEN** a floating panel appears with message history and a Hebrew input field without leaving the canvas

#### Scenario: Close assistant panel
- **WHEN** an operator closes the panel
- **THEN** the canvas remains on the current draft and the panel can be reopened

### Requirement: Live highlight of AI changes
After each successful AI edit, the Flow Builder SHALL update the canvas from the returned draft and bring affected nodes into view.

#### Scenario: Focus changed nodes
- **WHEN** an AI edit modifies nodes `speak_price` and `listen_price`
- **THEN** those nodes are selected or fit into view on the canvas within one second of the response

#### Scenario: Multiple affected nodes
- **WHEN** an AI edit affects more than one node
- **THEN** the builder fits the viewport to include all `affectedNodeIds` or focuses the first and allows stepping through them

### Requirement: Undo last AI edit (20 levels)
The AI assistant panel SHALL provide **בטל שינוי אחרון** that restores the draft graph to the state before the most recent successful AI patch, supporting up to **20** consecutive undo levels per builder session.

#### Scenario: Undo one AI change
- **WHEN** an operator applies an AI edit and then clicks undo
- **THEN** the draft and canvas revert to the pre-edit graph

#### Scenario: Undo stack limit
- **WHEN** the operator has undone 20 AI edits or the undo stack is empty
- **THEN** the undo control is disabled with a Hebrew hint

#### Scenario: Manual edit clears AI undo
- **WHEN** an operator manually changes the graph after an AI edit
- **THEN** the AI undo stack is cleared to avoid reverting unrelated manual work

## MODIFIED Requirements

### Requirement: Flow versioning and publish
Operators SHALL save draft graphs and publish an active version; calls started after publish use the new version; in-progress calls retain the version at call start. **AI-assisted edits SHALL update the draft graph (auto-saved after each valid patch) and SHALL NOT publish automatically.**

#### Scenario: Publish new flow version
- **WHEN** an operator clicks "פרסם זרימה" on a validated graph
- **THEN** the version increments and new outbound calls use the published graph

#### Scenario: AI edit does not publish
- **WHEN** an operator completes an AI-assisted edit
- **THEN** the draft is updated and saved but the published active version is unchanged until explicit publish
