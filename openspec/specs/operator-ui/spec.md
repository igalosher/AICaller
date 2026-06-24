# operator-ui Specification

## Purpose
TBD - created by archiving change yes-ai-sales-caller. Update Purpose after archive.
## Requirements
### Requirement: Hebrew RTL interface
The entire operator interface SHALL be in Hebrew with right-to-left (RTL) layout.

#### Scenario: RTL layout applied
- **WHEN** an operator opens any screen in the application
- **THEN** text direction is RTL, labels are in Hebrew, and navigation follows RTL conventions

### Requirement: Main navigation
The application SHALL provide a main menu with sections: Contacts (אנשי קשר), Calls (שיחות), Sales Configuration (הגדרות מכירה), **Flow Builder (בניית זרימה)**, **Intent Management (ניהול כוונות)**, Call Flow (זרימת שיחה — legacy, redirects or embeds builder), and Settings (הגדרות).

#### Scenario: Navigate between sections
- **WHEN** an operator selects a menu item
- **THEN** the corresponding section loads without full page reload (SPA behavior)

### Requirement: Contacts screen
The contacts screen SHALL display a searchable, filterable table of contacts with actions: add, edit, delete, call, and view history.

#### Scenario: Contact list view
- **WHEN** an operator opens the contacts section
- **THEN** contacts are shown with name, phone, status badge, and last call date

### Requirement: Calls dashboard
The calls section SHALL show active calls, recent call log, and quick actions; **call detail view SHALL display intent label and confidence on each customer transcript line**.

#### Scenario: View transcript with intents
- **WHEN** an operator opens a completed call detail
- **THEN** each customer utterance shows its classified intent badge and optional re-label action linking to Intent Management

### Requirement: Sales configuration screens
Operators SHALL manage packets, channels, internet tiers, and phone options through dedicated configuration forms with Hebrew labels and validation feedback.

#### Scenario: Manage packets UI
- **WHEN** an operator opens sales configuration
- **THEN** all active and inactive packets are listed with edit and deactivate actions

### Requirement: Call flow editor
Operators SHALL design conversation flows in the **visual Flow Builder** (graph canvas with speak, listen, decision, and intent-route nodes). The legacy structured editor MAY remain as read-only import source until deprecated.

#### Scenario: Edit opening speak node
- **WHEN** an operator opens Flow Builder and selects the start speak node
- **THEN** the editor shows template variables (e.g., `{{customer_first_name}}`) and a Hebrew preview

### Requirement: Settings screen
The settings screen SHALL include telephony provider config, AI/voice provider config, and general application preferences.

#### Scenario: Configure providers
- **WHEN** an operator saves settings with valid provider configurations
- **THEN** a connection test runs and displays success or failure in Hebrew

### Requirement: Dashboard summary
The home/dashboard SHALL show key metrics: total contacts, pending calls, sold today, refused count, and active call indicator.

#### Scenario: Dashboard metrics
- **WHEN** an operator opens the application
- **THEN** summary metrics reflect current data from the contact and call databases

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

### Requirement: OpenAI balance indicator
The application header SHALL display an OpenAI balance or billing-status badge near the logo, refreshing periodically when an API key is configured.

#### Scenario: Balance available
- **WHEN** OpenAI billing data is available for the configured API key
- **THEN** the header shows the approximate USD balance

#### Scenario: Balance unavailable
- **WHEN** no reliable balance API is available for the configured key
- **THEN** the header shows a link to the OpenAI billing dashboard with Hebrew label

#### Scenario: No API key configured
- **WHEN** no OpenAI API key is saved in settings
- **THEN** the header shows a Hebrew prompt to configure OpenAI in settings

