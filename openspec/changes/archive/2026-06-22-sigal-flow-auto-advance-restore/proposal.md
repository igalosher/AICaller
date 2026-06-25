## Why

Informational speak nodes (fiber availability announcements, summary before callback) were wired as speak → listen → route, so the call **paused and waited** after lines like "יש לנו חדשות מצוינות! יש תשתית סיבים בכתובת שלך" instead of continuing to the next question. A graph-enhancement pass also **overwrote operator-authored speak text**—removing Hebrew niqqud (ניקוד), splitting the TV count question into a separate node, and dropping the internet-step TV acknowledgment.

## What Changes

- **Auto-advance announcement speaks**: `autoAdvance` on informational speak nodes; speak → speak edges for fiber yes/no/exists, no-internet ack, and summary; orphan listen/route nodes removed at enhance time
- **Runtime orphan-route continuation**: when the engine lands on an intent_route fed only by announcement speaks, auto-follow the default speak edge without waiting for customer input
- **Restore Sigal default flow content**: combined opening + TV question in `speak_opening` with operator niqqud; `speak_inet` acknowledges `{{NumOfTVs}}`; `speak_opening` → `listen_tv` topology
- **Graph enhance preserves speak text**: `enhanceSigalGraph` patches routing, bindings, and variables only—never replaces operator `speak` node `text`
- **TV variable consolidation**: collapse duplicate `numOfTVs` / `NumOfTVs` aliases into canonical `NumOfTVs`
- **Restore script** `restore-flow-from-v19.ts` to re-apply published content from a known-good version with current enhancements
- Update automated graph flow tests for combined opening topology

## Capabilities

### Modified Capabilities

- `call-flow-configuration`: Auto-advance announcement speaks; default Sigal opening topology; enhance must not overwrite speak text
- `agent-persona`: Opening includes niqqud pronunciation hints and creator credit line
- `hebrew-voice-ai`: Operator-authored niqqud in speak templates is passed through to TTS

## Impact

- **Server**: `sigalMiniFlow.ts`, `graphFlowEngine.ts`, `graphFlowRuntime.ts`, `graphTypes.ts`, `callService.ts`, `flowGraphService.ts`, `seed.ts`
- **Scripts**: `restore-flow-from-v19.ts`, updated `test-sigal-graph-flow.ts`, `test-sigal-miniflow.ts`
- **Data**: Active published graph restored from v19 content + v21 structural fixes
