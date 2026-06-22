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
The application SHALL provide a main menu with sections: Contacts (אנשי קשר), Calls (שיחות), Sales Configuration (הגדרות מכירה), Call Flow (זרימת שיחה), and Settings (הגדרות).

#### Scenario: Navigate between sections
- **WHEN** an operator selects a menu item
- **THEN** the corresponding section loads without full page reload (SPA behavior)

### Requirement: Contacts screen
The contacts screen SHALL display a searchable, filterable table of contacts with actions: add, edit, delete, call, and view history.

#### Scenario: Contact list view
- **WHEN** an operator opens the contacts section
- **THEN** contacts are shown with name, phone, status badge, and last call date

### Requirement: Calls dashboard
The calls section SHALL show active calls, recent call log, and quick actions to start a new call or call next in queue.

#### Scenario: View recent calls
- **WHEN** an operator opens the calls section
- **THEN** recent calls are listed with contact name, duration, outcome, and timestamp

### Requirement: Sales configuration screens
Operators SHALL manage packets, channels, internet tiers, and phone options through dedicated configuration forms with Hebrew labels and validation feedback.

#### Scenario: Manage packets UI
- **WHEN** an operator opens sales configuration
- **THEN** all active and inactive packets are listed with edit and deactivate actions

### Requirement: Call flow editor
Operators SHALL edit opening lines, flow stages, and objection scripts through a visual or structured editor with template variable hints.

#### Scenario: Edit opening line
- **WHEN** an operator opens call flow configuration
- **THEN** the opening line editor shows available variables (e.g., `{{customer_name}}`) and a preview

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

