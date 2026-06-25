## Context

**פרטי שיחה** (`CallsPage`) shows merged transcript lines with intent badges on customer utterances. AI lines have no link to the graph. `Call.currentNodeId` is shown as text only. `CallTranscriptSegment` stores `speaker` + `text` without `flowNodeId`.

Browser test calls mount `TestCallAudio` only on `CallsPage`. Unmount closes the WebSocket; server `onSessionEnd` waits 5s then marks the call `ended` if no session reconnects.

Silence handling: staged flows use `scheduleStagedSilence` + `listen.silenceAdvanceSec` (often 5s). Graph flows classify empty STT as `silence` intent and route per edges — but there is **no timer** to auto-fire silence when the customer says nothing (browser test waits for typed input; Twilio waits for STT).

## Goals / Non-Goals

**Goals:**

- One-click navigation from transcript line → flow builder node in focus
- Test calls stay `connected` when operator switches to **בניית זרימה** or other nav tabs
- Universal **20s** listen timeout repeats last question on graph calls (test + Twilio)
- Persist node id on new AI transcript rows for replay/history

**Non-Goals:**

- Editing flow graph inline inside call detail (navigation only)
- Per-node configurable silence timeout in flow builder (fixed 20s global constant for v1)
- Twilio live-call audio in header (test-call WebSocket persistence only in v1; Twilio calls already survive navigation if no client teardown)
- Auto-publish flow edits from builder during call

## Decisions

### 1. Store `flowNodeId` on transcript segments

**Choice:** Add optional `flowNodeId String?` on `CallTranscriptSegment`. Set to the speak node id when AI speaks; for customer segments set to active listen checkpoint id when classification is persisted.

**Rationale:** Enables deep-link for completed calls, not only live `currentNodeId`.

**Alternative:** Derive from call snapshot at read time — insufficient for historical lines after flow advances.

### 2. Deep link ` /flow-builder?focus=<nodeId>`

**Choice:** Query param parsed on `FlowBuilderPage` mount; `setSelectedId`, `reactFlow.fitView({ nodes: [{ id }] })` after graph load.

**Rationale:** Simple, shareable, works with browser back.

**Alternative:** React Router `state` only — lost on refresh.

### 3. Lift test-call session to `Layout`

**Choice:** `ActiveTestCallProvider` in `Layout` holds WebSocket + audio when `activeCall.externalCallId` starts with `test-`. `CallsPage` renders controls via context; leaving the page does not unmount the provider.

**Rationale:** Minimal change; one WS per active test call.

**Server:** Change `onSessionEnd` — do **not** auto-end call on brief WS disconnect; end only on explicit hang-up, call completion, or prolonged idle (e.g. 30 min) optional later. v1: no auto-end on WS close if call still `connected`.

**Alternative:** `beforeunload` warning only — does not fix tab navigation within SPA.

### 4. Graph silence timer (20s)

**Choice:** After graph turn lands on a `listen` node (or post-speak auto-advance completes on listen), call `scheduleGraphSilence(callId, 20)`. Timer invokes `handleCustomerSpeech(callId, "")` which classifies as `silence` — but **override** graph repeat path: if at listen checkpoint, speak `lastSpokenText` from `contextJson` without advancing (same as `didnt_understand`).

**Rationale:** Reuses repeat logic; 20s is operator-requested constant.

**Alternative:** Wire every `route_*` with `silence → speak_*` edges — duplicates graph config and misses browser test with no STT.

### 5. Transcript UI actions

**Choice:** AI lines: button **ערוך בזרימה** when `flowNodeId` present. Customer lines: **צומת האזנה** linking to listen node when `flowNodeId` set.

## Risks / Trade-offs

- **[Risk] Old transcripts lack `flowNodeId`** → Show button only when field present; live lines always populated going forward
- **[Risk] Focus param targets deleted node** → Toast "צומת לא נמצא" and clear selection
- **[Risk] Orphan WS if operator abandons tab** → Server keeps call `connected`; operator must hang up manually (acceptable for test)
- **[Risk] 20s repeat during long TTS** → Reset silence timer when AI starts speaking; start timer only when listen is active and playback finished
- **[Risk] Duplicate silence repeats** → Clear timer on any customer speech or turn processing

## Migration Plan

1. Prisma migration add `flowNodeId` nullable, no backfill
2. Deploy server + client together
3. Existing calls: jump button appears on new segments only

## Open Questions

- Should header show mini test-call reply box on all pages, or only a "חזור לשיחה" link?
- Apply 20s silence to staged flows too (replace per-stage `silenceAdvanceSec`) or graph-only for v1? **Proposal: graph + browser test + Twilio graph calls; staged unchanged unless unified later.**
