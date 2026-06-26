### Requirement: Conversation mode switch
The application header SHALL display a **Flow Mode / Agent Mode** switch adjacent to the YES AI Caller logo. The switch SHALL reflect the persisted global conversation mode and save changes without a full page reload.

#### Scenario: Mode visible on all screens
- **WHEN** an operator navigates any main screen
- **THEN** the mode switch remains visible in the header

### Requirement: Agent configuration screen
The application SHALL provide a navigation entry **סוכן** (Agent) for configuring mission, limits, policies, opening template, and the learning example library.

#### Scenario: Open Agent screen
- **WHEN** an operator clicks **סוכן** in the nav
- **THEN** the Agent configuration UI opens with mission, limits, policies, and examples sections

### Requirement: AI response correction on Calls
On the Calls / call-detail view, AI transcript lines from **agent-mode** calls SHALL offer a control to submit a corrected response that is saved to the agent example library.

#### Scenario: Correct AI line
- **WHEN** an operator corrects an AI transcript line on an agent call
- **THEN** the correction is saved as an approved example without leaving the Calls screen
