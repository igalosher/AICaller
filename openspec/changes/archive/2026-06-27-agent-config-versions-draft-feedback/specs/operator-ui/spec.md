## ADDED Requirements

### Requirement: Agent config version history UI
The **סוכן** page SHALL provide version history controls adjacent to **שמור הגדרות סוכן**: list past versions, preview snapshot fields, and restore with confirmation.

#### Scenario: Version picker visible
- **WHEN** an operator opens **סוכן**
- **THEN** a control (e.g. dropdown or panel) shows current version number and access to history

#### Scenario: Restore confirmation
- **WHEN** an operator chooses to restore a historical version
- **THEN** a Hebrew confirmation dialog warns that active config will be replaced before applying

### Requirement: Agent draft review inbox
The **סוכן** page SHALL display a **טיוטות ממתינות** section listing pending drafts with approve and discard actions.

#### Scenario: Pending drafts visible
- **WHEN** pending drafts exist
- **THEN** the Agent page shows each draft with kind, summary text, source call link, and created date

#### Scenario: Empty inbox
- **WHEN** no pending drafts exist
- **THEN** the inbox shows a short Hebrew empty state

### Requirement: Expanded call-step agent feedback
On agent-mode call detail, the AI line correction control SHALL support corrected response text **and** optional instruction feedback (target: mission, limits, or policies) with operator note. Submit SHALL indicate the feedback is saved as a draft.

#### Scenario: Instruction feedback fields
- **WHEN** an operator opens agent feedback on an AI transcript line
- **THEN** the modal includes optional instruction target and text fields in addition to corrected response

#### Scenario: Draft confirmation message
- **WHEN** an operator submits call-step feedback
- **THEN** the UI confirms in Hebrew that changes were saved as drafts pending review on **סוכן**

## MODIFIED Requirements

### Requirement: AI response correction on Calls
On the Calls / call-detail view, AI transcript lines from **agent-mode** calls SHALL offer a control to submit operator feedback. Feedback SHALL create pending drafts (response and/or instruction patches) rather than immediately updating the approved example library or live agent config.

#### Scenario: Correct AI line creates draft
- **WHEN** an operator submits feedback on an AI transcript line on an agent call
- **THEN** a pending draft is created and the operator sees draft confirmation (not "saved to library" for immediate effect)
