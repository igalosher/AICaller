## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Active call monitoring
During an active call, operators SHALL see real-time status (duration, current stage or graph node, live transcript snippet) in the UI. Transcript lines SHALL include `flowNodeId` when available for flow-builder navigation.

#### Scenario: Monitor active call
- **WHEN** a call is connected on a staged flow
- **THEN** the operator UI shows call duration, current `currentStageId`, and rolling transcript updates

#### Scenario: Monitor graph call with node links
- **WHEN** a call is connected on a graph flow
- **THEN** each new AI transcript line includes `flowNodeId` for the speak node that produced it
