## MODIFIED Requirements

### Requirement: Flow Builder screen
The application SHALL provide a full-screen Flow Builder with node palette, canvas zoom/pan, edge labels, validation panel, draft save, publish actions, **and an AI assistant entry point for Hebrew natural-language flow editing**, all in Hebrew RTL.

#### Scenario: Build decision branch
- **WHEN** an operator adds a decision node and connects "מחיר גבוה" and "לא מעוניין" edges to different speak nodes
- **THEN** the graph is persisted as draft and can be published after validation passes

#### Scenario: AI assistant visible on builder
- **WHEN** an operator opens **בניית זרימה**
- **THEN** an AI control is visible in the builder chrome alongside existing save/publish actions
