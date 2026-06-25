# telephony-outbound Specification

## Purpose
TBD - created by archiving change yes-ai-sales-caller. Update Purpose after archive.
## Requirements
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
During an active call, operators SHALL see real-time status (duration, current stage or graph node, live transcript snippet) in the UI. Transcript lines SHALL include `flowNodeId` when available for flow-builder navigation.

#### Scenario: Monitor active call
- **WHEN** a call is connected on a staged flow
- **THEN** the operator UI shows call duration, current `currentStageId`, and rolling transcript updates

#### Scenario: Monitor graph call with node links
- **WHEN** a call is connected on a graph flow
- **THEN** each new AI transcript line includes `flowNodeId` for the speak node that produced it

### Requirement: Manual takeover (future-ready)
The architecture SHALL support operator manual takeover of an active call (listen-only in v1; full handoff as optional enhancement).

#### Scenario: Listen to active call
- **WHEN** an operator opens the active call monitor
- **THEN** the operator can hear the live call audio stream in the application

### Requirement: Graph listen silence repeat
On graph-flow calls, when the runtime is waiting at a **listen** checkpoint, the system SHALL start a **20-second** silence timer after the AI finishes speaking. If no customer speech is received before the timer fires, the AI SHALL repeat the last spoken question (`lastSpokenText`) without advancing the flow.

#### Scenario: Twenty seconds silence repeats question
- **WHEN** a graph call is at `listen_inet`, the AI asked the internet question, and 20 seconds pass with no customer input
- **THEN** the AI repeats the internet question and remains at `listen_inet`

#### Scenario: Customer speech cancels timer
- **WHEN** the customer responds before 20 seconds elapse
- **THEN** the silence timer is cleared and normal classification runs

#### Scenario: Timer not active during AI speech
- **WHEN** the AI is still playing TTS for the current question
- **THEN** the 20-second silence timer does not fire until playback completes

### Requirement: Transcript records flow node
When the AI speaks on a graph call, the system SHALL store the speak node id on the corresponding `CallTranscriptSegment` as `flowNodeId`.

#### Scenario: AI segment linked to speak node
- **WHEN** the runtime speaks `speak_address` during a call
- **THEN** the new AI transcript segment has `flowNodeId` `speak_address`

