## Context

Browser test calls use `TestCallAudio` + WebSocket (`/ws/test-call`). The server sends full MP3 clips via `{ type: "play", audio }`. Transcript and flow position are committed **before** playback (`prepareInitialVoiceTurn` / `processCustomerTurn` → `addTranscript` → `speakToBrowser`). The client `await`s `playMp3` inside the `play` handler, which blocks `setSending(false)` until audio ends after a customer reply.

`stop_playback` exists and is invoked from `handleCustomerSpeech` — that path is **customer interrupt** (classify utterance, possibly Q&A branch). Operators need the opposite: stop audio only, keep flow at post-speak / listen-ready state.

## Goals / Non-Goals

**Goals:**

- Show a skip control only while test-call TTS is actively playing
- Stop client audio immediately; unblock reply input
- Do not call `handleCustomerSpeech`, `stopBrowserPlayback` via interrupt path, or mutate flow beyond what already happened at speak preparation
- Server acknowledges skip for consistent client state (optional `speak_complete` / `speak_skipped` message)

**Non-Goals:**

- Skip on Twilio or mock telephony calls
- Truncating transcript to partial spoken text
- Advancing the flow graph (speak already completed server-side)
- Replacing customer barge-in semantics

## Decisions

### 1. Client-led skip with server ack (no flow re-entry)

**Choice:** Client stops `AudioBufferSourceNode`, sends `{ type: "skip_speak" }`. Server validates test session, calls `stopBrowserPlayback` (harmless if already stopped), replies `{ type: "speak_skipped" }`. Server does **not** invoke `onCustomerSpeech`.

**Rationale:** Flow state is already correct after speak was prepared; skip is purely playback UX. Avoids duplicating turn logic on server.

**Alternative considered:** Server tracks speak completion timer — rejected; client knows playback state accurately.

### 2. Track `isPlaying` on client

**Choice:** `isPlaying` state true from `play` start until natural `onended`, skip, or `stop_playback`. Skip button visible when `status === "ready" && isPlaying`.

**Rationale:** Opening greeting and post-reply speaks both use `play`; single flag covers both.

### 3. Unblock `sending` on skip

**Choice:** On skip or `speak_skipped`, set `sending = false` and `isPlaying = false` so reply form is enabled.

**Rationale:** Matches natural playback end behavior after customer-triggered turns.

### 4. Distinct from typed reply during playback

**Choice:** If operator types and sends while audio plays, existing `handleCustomerSpeech` + `stopBrowserPlayback` remains **interrupt** behavior. Skip button is the only path for complete-turn skip.

**Rationale:** User explicitly asked skip ≠ interrupt. Document in UI hint.

## Risks / Trade-offs

- **Operator confusion (skip vs send reply)** → Short Hebrew label "דלג לסוף" + tooltip that skip does not simulate customer speech
- **Double skip** → Ignore `skip_speak` when not in a playing state
- **No server speak-in-progress flag** → Client is source of truth for playback; acceptable for test-only UX

## Migration Plan

Deploy client + server together. No DB migration. Backward compatible: old clients without skip button behave as today.

## Open Questions

- Should skip also fire after opening speak (before first customer message)? **Yes** — any active `play` clip.
- Keyboard shortcut (e.g. Space) for skip? Defer unless requested.
