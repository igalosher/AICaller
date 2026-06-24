## Why

Operators testing flows in the browser test call must wait for long TTS prompts to finish before typing the next customer reply. Skipping ahead is a common need during flow QA, but stopping playback today (or typing mid-speech) can behave like a **barge-in interrupt**, which changes flow state. Operators need a dedicated control that stops audio yet leaves the call in the same state as if the AI had finished speaking the full prompt.

## What Changes

- **Skip-speak button (test call only)**: While the AI is playing TTS in `TestCallAudio`, show a button (e.g. "דלג לסוף") that stops playback immediately.
- **Complete-turn semantics**: Skip SHALL NOT invoke customer speech handling, intent classification, or Q&A interrupt logic. Transcript, `currentStage` / graph node, and listen readiness SHALL match a natural end-of-speak.
- **WebSocket message**: Client sends a `skip_speak` (or equivalent) message; server acknowledges with `speak_skipped` and may stop any in-flight browser playback signal.
- **UI state**: After skip, the reply input becomes available as when playback ends naturally (not stuck in "מעבד תשובה...").
- **Scope guard**: Feature applies only to browser test calls (`externalCallId` `test-*`). Twilio/production calls unchanged.

## Capabilities

### New Capabilities

- `browser-test-call`: Browser test call session UX — typed customer replies, TTS playback, and operator skip-speak control with complete-turn semantics

### Modified Capabilities

- `hebrew-voice-ai`: Clarify that barge-in / interrupt applies to **customer** speech; operator skip-speak in test mode is not an interrupt

## Impact

- **Client**: `TestCallAudio.tsx` — skip button, playback state tracking, `skip_speak` WebSocket message
- **Server**: `browserTestSession.ts` — handle skip message, stop playback without routing to `handleCustomerSpeech`
- **Server**: `callService.ts` — optional tracking of pending browser speak turn (if needed to align UI with server)
- **Tests**: Script or unit test for skip message handling; manual QA on long opening + listen stages
- **Out of scope**: Twilio barge-in, flow graph changes, transcript truncation
