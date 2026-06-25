## 1. Data model and transcript linking

- [x] 1.1 Add optional `flowNodeId` to `CallTranscriptSegment` (Prisma migration)
- [x] 1.2 Extend `addTranscript` to accept `flowNodeId`; pass speak node id on AI lines and listen id on customer lines
- [x] 1.3 Include `flowNodeId` in call API responses and live `transcript` WebSocket events

## 2. Graph silence repeat (20s)

- [x] 2.1 Add `scheduleGraphSilence` / `clearGraphSilence` in `callService.ts` (20s constant)
- [x] 2.2 Start timer when graph turn ends on a listen checkpoint after AI playback completes
- [x] 2.3 On timeout: repeat `lastSpokenText` without advancing (reuse `didnt_understand` repeat path)
- [x] 2.4 Clear timer on customer speech, hang-up, and call end; wire browser test + Twilio paths
- [x] 2.5 Add server test or script for silence repeat at listen checkpoint

## 3. Browser test session persistence

- [x] 3.1 Create `ActiveTestCallProvider` (or equivalent) in `Layout` holding WebSocket + audio state
- [x] 3.2 Move `TestCallAudio` connection logic to provider; `CallsPage` consumes context
- [x] 3.3 Change server `onSessionEnd`: do not auto-end call on brief WS disconnect while status is `connected`
- [x] 3.4 Add header chip: active test call + link back to **שיחות**

## 4. Call detail → flow builder navigation

- [x] 4.1 Add "ערוך בזרימה" (and listen variant) buttons on transcript lines with `flowNodeId` in `CallsPage`
- [x] 4.2 Navigate to `/flow-builder?focus=<nodeId>`

## 5. Flow builder deep link

- [x] 5.1 Parse `focus` query param on `FlowBuilderPage` load
- [x] 5.2 Select node, fit view, show Hebrew error if node missing

## 6. Verification

- [ ] 6.1 Manual: test call → open **בניית זרימה** from AI line → edit node → return; call still live
- [ ] 6.2 Manual: wait 20s at listen → AI repeats last question
- [ ] 6.3 Manual: legacy transcript lines without `flowNodeId` show no jump button
