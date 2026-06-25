## Why

While reviewing calls on **פרטי שיחה**, operators need to jump straight from a spoken line to the matching flow node, edit the script, and return — without losing an in-progress test call. Today transcript lines have no flow link, leaving **בניית זרימה** requires manual node hunting, and navigating away from **שיחות** tears down the browser-test WebSocket and ends the call after a grace period. Graph calls also lack a reliable **20-second silence** repeat of the last question (only staged flows schedule silence today).

## What Changes

- **Flow jump from transcript**: Each AI transcript line (and customer lines where a listen/node is known) gets an action to open **בניית זרימה** with that node selected and centered on the canvas
- **Persist `flowNodeId` on transcript segments** when the AI speaks (and optionally listen checkpoint for customer turns) so historical calls can deep-link too
- **Flow Builder deep link**: Support `?focus=<nodeId>` (or route state) to select, scroll, and fit-view the target node on load
- **Keep calls alive across SPA navigation**: Lift browser-test audio/WebSocket to app shell level; reconnect when returning to **שיחות** without ending the call; show a compact active-call indicator in the header while on other tabs
- **20-second silence repeat**: After any listen checkpoint on graph (and browser/Twilio) calls, if no customer speech within **20 seconds**, repeat `lastSpokenText` without advancing the flow (same behavior as "לא הבנתי" repeat)

## Capabilities

### New Capabilities

_(none — requirements extend existing operator, telephony, builder, and test-call specs)_

### Modified Capabilities

- `operator-ui`: Transcript line → flow builder action; active-call banner when navigating during live/test calls
- `visual-flow-builder`: Deep-link focus on a node by id from call detail navigation
- `browser-test-call`: Test-call WebSocket session survives operator navigation between app sections until explicit hang-up or call end
- `telephony-outbound`: Graph-call silence timer (20s) repeats last question at listen checkpoints

## Impact

- **Database**: optional `flowNodeId` on `CallTranscriptSegment` (migration)
- **Server**: `addTranscript` records node id; graph silence scheduler in `callService.ts`; browser session end policy when WS closes due to navigation vs hang-up
- **Client**: `CallsPage` transcript actions; `FlowBuilderPage` focus param; `Layout` or root-level `TestCallAudio` + active-call chip; WebSocket reconnect logic
- **API/WS**: transcript payloads may include `flowNodeId`; call events unchanged
