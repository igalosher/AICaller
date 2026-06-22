## ADDED Requirements

### Requirement: Outbound call initiation
The system SHALL place outbound phone calls to contacts on the closed list using a configured telephony provider.

#### Scenario: Call single contact
- **WHEN** an operator clicks "התקשר" on a contact with status other than `refused`
- **THEN** the system initiates an outbound call to the contact's phone number and connects the AI voice pipeline

#### Scenario: Call refused contact blocked
- **WHEN** an operator attempts to call a contact with status `refused`
- **THEN** the system blocks the call and displays a Hebrew warning

### Requirement: Call next in queue
Operators SHALL be able to call the next eligible contact (status `pending` or `callback`, not `refused`) automatically.

#### Scenario: Call next contact
- **WHEN** an operator triggers "התקשר לבא בתור"
- **THEN** the system selects the next eligible contact and initiates the call

### Requirement: Call state management
The system SHALL track call states: `dialing`, `ringing`, `connected`, `ended`, `failed`, `no_answer`, `busy`.

#### Scenario: No answer handling
- **WHEN** a call rings out with no answer
- **THEN** the call state is recorded as `no_answer`, the contact remains `pending` or moves to `callback` per configuration

#### Scenario: Connected call bridges AI
- **WHEN** the callee answers
- **THEN** the telephony layer bridges audio bidirectionally to the Hebrew voice AI pipeline

### Requirement: Telephony provider configuration
Operators SHALL configure telephony credentials (provider API keys, caller ID number, webhook URLs) through a secure settings screen.

#### Scenario: Save telephony credentials
- **WHEN** an operator enters valid provider credentials and saves
- **THEN** credentials are stored encrypted and test-call functionality becomes available

### Requirement: Active call monitoring
During an active call, operators SHALL see real-time status (duration, current stage, live transcript snippet) in the UI.

#### Scenario: Monitor active call
- **WHEN** a call is connected
- **THEN** the operator UI shows call duration, current flow stage, and rolling transcript updates

### Requirement: Manual takeover (future-ready)
The architecture SHALL support operator manual takeover of an active call (listen-only in v1; full handoff as optional enhancement).

#### Scenario: Listen to active call
- **WHEN** an operator opens the active call monitor
- **THEN** the operator can hear the live call audio stream in the application
