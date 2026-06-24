## MODIFIED Requirements

### Requirement: Outbound call initiation
The system SHALL place outbound phone calls to contacts on the closed list using a configured telephony provider.

#### Scenario: Call single contact
- **WHEN** an operator clicks "התקשר" on a contact with status other than `refused` or `blacklisted`
- **THEN** the system initiates an outbound call to the contact's phone number and connects the AI voice pipeline

#### Scenario: Call refused or blacklisted contact blocked
- **WHEN** an operator attempts to call a contact with status `refused` or `blacklisted`
- **THEN** the system blocks the call and displays a Hebrew warning

### Requirement: Call next in queue
Operators SHALL be able to call the next eligible contact (status `pending` or `callback`, not `refused` or `blacklisted`) automatically.

#### Scenario: Call next contact
- **WHEN** an operator triggers "התקשר לבא בתור"
- **THEN** the system selects the next eligible contact and initiates the call

### Requirement: Active call monitoring
During an active call, operators SHALL see real-time status (duration, current stage or graph node, live transcript snippet) in the UI.

#### Scenario: Monitor active call
- **WHEN** a call is connected on a staged flow
- **THEN** the operator UI shows call duration, current `currentStageId`, and rolling transcript updates
