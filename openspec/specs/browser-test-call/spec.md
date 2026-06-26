# browser-test-call Specification

## Purpose
Browser-based test calls let operators exercise the same call runtime as Twilio (flow or agent mode) without telephony: AI replies appear in the transcript, optional ElevenLabs TTS plays in the browser, and the operator types customer replies over a WebSocket owned by the app shell.

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

### Requirement: Thinking indicator in test call
During browser test calls, while the server waits for an LLM reply, it SHALL signal `{ type: "thinking_start" }` on the WebSocket and the client SHALL play the **rising-tone** hold sound until `{ type: "thinking_stop" }` or reply TTS begins.

#### Scenario: Thinking while generating reply
- **WHEN** the operator sends a customer reply and the server invokes the LLM
- **THEN** the operator hears ascending tones (392 → 494 → 587 Hz) until the AI response audio starts

### Requirement: Test call survives SPA navigation
A browser test call session SHALL remain active when the operator navigates to other application sections (e.g. **בניית זרימה**, **אנשי קשר**) until the operator explicitly hangs up or the call ends normally.

#### Scenario: Navigate away during test call
- **WHEN** a connected browser test call is in progress and the operator opens **בניית זרימה**
- **THEN** the call status remains `connected` and the WebSocket reconnects or stays open via the app shell

#### Scenario: Return to calls and continue
- **WHEN** the operator returns to **שיחות** during an active test call
- **THEN** the test-call audio controls and reply input are available without starting a new call

### Requirement: No silence retry in test calls
Browser test calls SHALL NOT schedule the graph/agent **20-second silence repeat** timer. Operators test flows by typing replies; automatic silence retries waste LLM/TTS credits and are inappropriate for keyboard-driven sessions.

#### Scenario: No auto-repeat after 20s idle
- **WHEN** a browser test call is connected and the operator does not type a reply for 20+ seconds at a listen checkpoint
- **THEN** the system does not invoke a silence-timeout customer turn or repeat the last question

### Requirement: Skip voice to save ElevenLabs credits
Operators SHALL be able to start browser test calls **without TTS synthesis**. When skip-voice is enabled, the runtime SHALL still advance flow/agent state and write transcripts, but SHALL NOT call ElevenLabs for that call.

#### Scenario: Checkbox before starting test call
- **WHEN** an operator enables **שיחת טסט בלי דיבור** on the Contacts screen (or the test-call panel when idle)
- **THEN** the preference is persisted locally and passed to `POST /calls/test-start` as `skipVoice: true`

#### Scenario: Text-only test session
- **WHEN** a test call starts with `skipVoice: true` and the WebSocket session begins
- **THEN** AI lines appear in the live transcript, the server sends `{ type: "voice_skipped", text }` instead of `{ type: "play" }`, and the reply input is available without waiting for audio

#### Scenario: Skip voice does not affect real calls
- **WHEN** an operator places a real Twilio outbound call
- **THEN** ElevenLabs TTS runs normally regardless of the browser test skip-voice preference

### Requirement: Test call WebSocket reconnect kickoff
The server SHALL deliver the opening utterance reliably across WebSocket reconnects (e.g. React Strict Mode). The first `start` message prepares flow state once; reconnects replay the latest AI transcript line without re-advancing the graph.

#### Scenario: Strict-mode double connect
- **WHEN** the client disconnects and reconnects before opening TTS finishes
- **THEN** the operator still receives the opening (or transcript replay) without duplicate graph advancement

### Requirement: Skip voice WebSocket protocol
When voice is skipped for a test call, the server SHALL send `{ type: "voice_skipped", text: string }` and the client SHALL treat it like completed playback (enable reply input, send `playback_done`).

#### Scenario: Voice skipped after customer reply
- **WHEN** skip-voice is active and the server finishes an AI turn
- **THEN** the client receives `voice_skipped` and does not attempt audio decode

