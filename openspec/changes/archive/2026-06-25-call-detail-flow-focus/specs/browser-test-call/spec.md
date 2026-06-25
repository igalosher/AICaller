## ADDED Requirements

### Requirement: Test call survives SPA navigation
A browser test call session SHALL remain active when the operator navigates to other application sections (e.g. **בניית זרימה**, **אנשי קשר**) until the operator explicitly hangs up or the call ends normally.

#### Scenario: Navigate away during test call
- **WHEN** a connected browser test call is in progress and the operator opens **בניית זרימה**
- **THEN** the call status remains `connected` and the WebSocket reconnects or stays open via the app shell

#### Scenario: Return to calls and continue
- **WHEN** the operator returns to **שיחות** during an active test call
- **THEN** the test-call audio controls and reply input are available without starting a new call

## MODIFIED Requirements

### Requirement: Browser test call session
The system SHALL support browser-based test calls where operators hear AI TTS and type customer replies over a WebSocket, without Twilio. The WebSocket connection SHALL be owned at application shell level, not tied to the Calls page mount lifecycle.

#### Scenario: Start test call
- **WHEN** an operator starts a test call for a contact
- **THEN** a WebSocket connects, the AI opening is spoken, and the operator can type a customer reply when playback completes or is skipped
