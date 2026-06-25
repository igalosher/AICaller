## 1. Auto-advance announcements

- [x] 1.1 Add `autoAdvance` to speak node type and `getNextAutoEdge` preference
- [x] 1.2 `patchSigalAutoAdvanceSpeaks` — speak→speak chains, orphan listen/route removal
- [x] 1.3 `isOrphanAnnouncementRoute` / `advanceOrphanAnnouncementRoute` in `callService.ts`

## 2. Flow content restore

- [x] 2.1 Restore v19 opening text with niqqud and combined TV question
- [x] 2.2 Restore `speak_inet` TV acknowledgment (`{{NumOfTVs}}`)
- [x] 2.3 Update `createSigalMiniFlowGraph` default topology (`speak_opening` → `listen_tv`)
- [x] 2.4 `restore-flow-from-v19.ts` script for DB restore

## 3. Variable and enhance safety

- [x] 3.1 `patchConsolidateTvVariables` — canonical `NumOfTVs`
- [x] 3.2 Confirm `enhanceSigalGraph` does not overwrite speak node text
- [x] 3.3 `patchActiveFlowEnhancements` on seed/migrate

## 4. Verification

- [x] 4.1 `npm run test:sigal-miniflow` — opening links to `listen_tv`
- [x] 4.2 `npm run test:sigal-graph-flow` — TV ack, fiber auto-chain, address after רגיל
- [x] 4.3 Published active flow validates with 0 errors after restore
