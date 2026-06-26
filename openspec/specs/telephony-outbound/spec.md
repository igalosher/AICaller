# telephony-outbound Specification

## Purpose
TBD - created by archiving change yes-ai-sales-caller. Update Purpose after archive.
## Requirements
### Requirement: Outbound call initiation
The system SHALL place outbound phone calls to contacts on the closed list using a configured telephony provider. On Twilio, the dial SHALL be initiated **immediately** after webhook reachability is confirmed; opening TTS MAY continue rendering in the background after the dial starts.

#### Scenario: Call single contact
- **WHEN** an operator clicks "התקשר" on a contact with status other than `refused` or `blacklisted`
- **THEN** the system initiates an outbound call to the contact's phone number and connects the AI voice pipeline

#### Scenario: Phone rings before opening TTS finishes
- **WHEN** an operator starts a Twilio call and opening MP3 synthesis takes several seconds
- **THEN** Twilio begins ringing the callee without waiting for opening synthesis to complete

#### Scenario: Call refused or blacklisted contact blocked
- **WHEN** an operator attempts to call a contact with status `refused` or `blacklisted`
- **THEN** the system blocks the call and displays a Hebrew warning

### Requirement: Call next in queue
Operators SHALL be able to call the next eligible contact (status `pending` or `callback`, not `refused` or `blacklisted`) automatically.

#### Scenario: Call next contact
- **WHEN** an operator triggers "התקשר לבא בתור"
- **THEN** the system selects the next eligible contact and initiates the call

### Requirement: Call state management
The system SHALL track call states: `dialing`, `ringing`, `connected`, `ended`, `failed`, `no_answer`, `busy`. Terminal states (`busy`, `failed`, `no_answer`, `ended`) SHALL NOT be overwritten by later `ringing` updates from a slow API response.

#### Scenario: No answer handling
- **WHEN** a call rings out with no answer
- **THEN** the call state is recorded as `no_answer`, the contact remains `pending` or moves to `callback` per configuration

#### Scenario: Busy line feedback
- **WHEN** Twilio reports `busy` for an outbound call
- **THEN** the call state is `busy`, the contact returns to `pending`, and the operator UI shows a Hebrew message that the line was busy or the call was declined

#### Scenario: Connected call bridges AI
- **WHEN** the callee answers
- **THEN** the telephony layer bridges audio bidirectionally to the Hebrew voice AI pipeline

### Requirement: Twilio trial caller ID
When placing outbound Twilio calls to a **verified** destination number on a trial account, the system SHALL use that verified number as the `From` caller ID when it matches the destination, improving pickup on Israeli mobiles versus a default US Twilio number.

#### Scenario: Verified Israeli destination
- **WHEN** the callee number is listed in Twilio verified caller IDs
- **THEN** `calls.create` uses the verified Israeli E.164 as `From` when calling that number

### Requirement: Local dev Twilio tunnel
Local development with `npm run dev:twilio` SHALL run **cloudflared** alongside the server, write `TWILIO_WEBHOOK_BASE_URL` and `DEV_TWILIO_TUNNEL=1` to `server/.env`, sync the URL to settings, and **restart cloudflared** automatically if the tunnel disconnects. The server SHALL NOT spawn a competing tunnel when `DEV_TWILIO_TUNNEL=1` and the public URL is dead; it SHALL instruct the operator to restart `dev:twilio`.

#### Scenario: Tunnel URL synced on start
- **WHEN** `dev:twilio` assigns a new trycloudflare URL
- **THEN** `.env`, database telephony settings, and Twilio voice webhooks use that URL

#### Scenario: Stale tunnel on call
- **WHEN** `DEV_TWILIO_TUNNEL=1`, the server is up, but the configured webhook URL is unreachable
- **THEN** starting a call fails with a Hebrew message to restart `npm run dev:twilio`

### Requirement: Telephony provider configuration
Operators SHALL configure telephony credentials (provider API keys, caller ID number, webhook URLs) through a secure settings screen.

#### Scenario: Save telephony credentials
- **WHEN** an operator enters valid provider credentials and saves
- **THEN** credentials are stored encrypted and test-call functionality becomes available

### Requirement: Active call monitoring
During an active call, operators SHALL see real-time status (duration, current stage or graph node, live transcript snippet, and **call status badge**) in the UI. Transcript lines SHALL include `flowNodeId` when available for flow-builder navigation.

#### Scenario: Monitor active call
- **WHEN** a call is connected on a staged flow
- **THEN** the operator UI shows call duration, current `currentStageId`, status badge, and rolling transcript updates

#### Scenario: Monitor graph call with node links
- **WHEN** a call is connected on a graph flow
- **THEN** each new AI transcript line includes `flowNodeId` for the speak node that produced it

#### Scenario: Busy call clears active monitor
- **WHEN** a call transitions to `busy`
- **THEN** the active-call panel clears and the operator sees the busy status message

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

