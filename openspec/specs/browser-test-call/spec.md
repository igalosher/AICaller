# browser-test-call Specification

## Purpose
TBD - created by archiving change test-call-skip-speak. Update Purpose after archive.
## Requirements
### Requirement: Browser test call session
The system SHALL support browser-based test calls where operators hear AI TTS and type customer replies over a WebSocket, without Twilio. The WebSocket connection SHALL be owned at application shell level, not tied to the Calls page mount lifecycle.

#### Scenario: Start test call
- **WHEN** an operator starts a test call for a contact
- **THEN** a WebSocket connects, the AI opening is spoken, and the operator can type a customer reply when playback completes or is skipped

### Requirement: Skip speak control
During browser test call playback only, the operator UI SHALL provide a control to skip to the end of the current AI utterance.

#### Scenario: Skip while AI is speaking
- **WHEN** the AI is playing TTS audio in a browser test call and the operator clicks "דלג לסוף"
- **THEN** playback stops immediately and the reply input becomes available

#### Scenario: Skip not shown when idle
- **WHEN** no TTS audio is playing in the browser test call
- **THEN** the skip control is hidden or disabled

### Requirement: Skip completes the speak turn
Skipping playback SHALL be treated as the AI having finished speaking the full prepared utterance. It SHALL NOT trigger customer speech processing, intent classification, or Q&A interrupt handling.

#### Scenario: Flow state unchanged after skip
- **WHEN** the operator skips during a speak line that was already written to the transcript
- **THEN** the transcript retains the full AI text, `currentStage` / graph node remain at the post-speak listen position, and no customer classification runs

#### Scenario: Skip differs from typed interrupt
- **WHEN** the operator types and sends a customer reply while audio is still playing
- **THEN** the system processes it as customer speech (including possible interrupt), which is distinct from using skip-speak

### Requirement: Skip WebSocket protocol
The browser test WebSocket SHALL accept `{ type: "skip_speak" }` from the client and respond with `{ type: "speak_skipped" }` for test calls only.

#### Scenario: Server acknowledges skip
- **WHEN** the client sends `skip_speak` during an active test call session
- **THEN** the server stops browser playback signaling and replies with `speak_skipped` without invoking customer turn processing

### Requirement: Test call survives SPA navigation
A browser test call session SHALL remain active when the operator navigates to other application sections (e.g. **בניית זרימה**, **אנשי קשר**) until the operator explicitly hangs up or the call ends normally.

#### Scenario: Navigate away during test call
- **WHEN** a connected browser test call is in progress and the operator opens **בניית זרימה**
- **THEN** the call status remains `connected` and the WebSocket reconnects or stays open via the app shell

#### Scenario: Return to calls and continue
- **WHEN** the operator returns to **שיחות** during an active test call
- **THEN** the test-call audio controls and reply input are available without starting a new call

