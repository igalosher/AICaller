## MODIFIED Requirements

### Requirement: Main navigation
The application SHALL provide a main menu with sections: Contacts (אנשי קשר), Calls (שיחות), Sales Configuration (הגדרות מכירה), **Flow Builder (בניית זרימה)**, **Intent Management (ניהול כוונות)**, Call Flow (זרימת שיחה — legacy, redirects or embeds builder), and Settings (הגדרות).

#### Scenario: Navigate between sections
- **WHEN** an operator selects a menu item
- **THEN** the corresponding section loads without full page reload (SPA behavior)

### Requirement: Call flow editor
Operators SHALL design conversation flows in the **visual Flow Builder** (graph canvas with speak, listen, decision, and intent-route nodes). The legacy structured editor MAY remain as read-only import source until deprecated.

#### Scenario: Edit opening speak node
- **WHEN** an operator opens Flow Builder and selects the start speak node
- **THEN** the editor shows template variables (e.g., `{{customer_first_name}}`) and a Hebrew preview

### Requirement: Calls dashboard
The calls section SHALL show active calls, recent call log, and quick actions; **call detail view SHALL display intent label and confidence on each customer transcript line**.

#### Scenario: View transcript with intents
- **WHEN** an operator opens a completed call detail
- **THEN** each customer utterance shows its classified intent badge and optional re-label action linking to Intent Management

## ADDED Requirements

### Requirement: Flow Builder screen
The application SHALL provide a full-screen Flow Builder with node palette, canvas zoom/pan, edge labels, validation panel, draft save, and publish actions—all in Hebrew RTL.

#### Scenario: Build decision branch
- **WHEN** an operator adds a decision node and connects "מחיר גבוה" and "לא מעוניין" edges to different speak nodes
- **THEN** the graph is persisted as draft and can be published after validation passes

### Requirement: Intent Management screen
The application SHALL provide a dedicated Intent Management screen to create/edit intents, manage Hebrew example phrases, set per-intent confidence thresholds, and view usage statistics.

#### Scenario: Tune intent from management screen
- **WHEN** an operator adds example phrases to `ask_channel` on the Intent Management screen
- **THEN** subsequent calls classify channel questions with higher accuracy

#### Scenario: Re-label utterance from call review
- **WHEN** an operator corrects a misclassified utterance on the Calls screen and saves as example
- **THEN** the phrase is added to the chosen intent without leaving the call review flow
