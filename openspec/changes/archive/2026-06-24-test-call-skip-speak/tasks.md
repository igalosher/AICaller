## 1. Client playback state

- [x] 1.1 Add `isPlaying` state in `TestCallAudio` — set true on `play` start, false on natural end, `stop_playback`, `speak_skipped`, or hangup
- [x] 1.2 Show "דלג לסוף" button when `status === "ready" && isPlaying`; hide when idle
- [x] 1.3 On skip click: stop `AudioBufferSourceNode`, send `{ type: "skip_speak" }`, clear `isPlaying` and `sending`

## 2. WebSocket protocol (server)

- [x] 2.1 Extend `BrowserClientMessage` with `skip_speak`; handle in `dispatchBrowserTestMessage` without calling `onCustomerSpeech`
- [x] 2.2 Reply `{ type: "speak_skipped" }` after `stopBrowserPlayback`; ignore duplicate skips when not playing
- [x] 2.3 Extend client `ServerMessage` type with `speak_skipped`

## 3. UX polish

- [x] 3.1 Short Hebrew hint: skip stops audio only — does not send customer speech (distinct from typing a reply)
- [x] 3.2 Ensure reply input unblocks immediately after skip (including post-reply waits that blocked on `playMp3`)

## 4. Verification

- [x] 4.1 Manual: long opening — skip mid-play, verify transcript full text and next reply advances flow normally
- [x] 4.2 Manual: skip vs typed reply during playback — skip does not classify; typed reply does
- [x] 4.3 Add `server/scripts/test-skip-speak.ts` — WebSocket sends `skip_speak`, asserts `speak_skipped` and no transcript customer line
