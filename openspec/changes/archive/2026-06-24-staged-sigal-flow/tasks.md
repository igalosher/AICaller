## 1. Data model and contact status

- [x] 1.1 Add `blacklisted` to Prisma `ContactStatus` enum and run migration
- [x] 1.2 Update `contactStatus.ts` — `isCallable()` excludes `blacklisted`; add Hebrew label
- [x] 1.3 Update client contact status dropdown/filter to include `blacklisted`
- [x] 1.4 Block manual dial and call-next for `blacklisted` contacts in API and UI

## 2. Intents and classification

- [x] 2.1 Seed intents: `opt_out_remove`, `ask_offer`, `didnt_understand`, `provide_tv_count`, `internet_*`, `provide_address`
- [x] 2.2 Add classification paths for all new intents in `intentService` (rules + LLM); extract `tv_count` entity
- [x] 2.3 Implement silence timer → synthetic `silence` classification for staged listen nodes
- [x] 2.4 Route staged vs graph navigation; `didnt_understand` → repeat last statement (priority over Q&A)

## 3. Staged flow engine

- [x] 3.1 Define staged flow JSON schema (`stages[]`, `subflows{}`, `branchOn`, `advanceOn`, `interruptible`, `lastSpokenText` persistence)
- [x] 3.2 Implement `StagedFlowEngine` — speak, listen, classify, branch (advance / subflow / Q&A / repeat / opt-out)
- [x] 3.3 Persist `currentStageId` and `currentSubflowId` on call record; expose in active-call monitor API
- [x] 3.4 Wire `callService` to dispatch staged engine when active flow is `flowType: "staged"`
- [x] 3.5 Implement opt-out handler: speak "תודה רבה ויום נעים", end call, set contact `blacklisted`

## 4. Default flow and migration

- [x] 4.1 Create `createDefaultStagedFlow()` with full MiniFlow stages and subflows
- [x] 4.2 Publish staged flow as default active outbound flow (migrate/replace graph default)
- [x] 4.3 Template variables: `{{customer_first_name}}`, `{{customer_family_name}}`, `{{agent_name}}`

## 5. Q&A interrupt layer

- [x] 5.1 On interruptible stages, route product intents to existing `productKnowledge` + `generateSalesReply`
- [x] 5.2 After Q&A answer, resume listen on same `currentStageId` (no stage advance unless `advanceOn` matched)
- [x] 5.3 Ensure `ask_offer` on stage `opening` advances (not treated as generic Q&A only)

## 6. Voice and telephony

- [x] 6.1 Update LLM persona prompt for digital-assistant Sigal opener compliance copy
- [x] 6.2 Verify long opening TTS plays fully on Twilio (hold/gather timing)
- [x] 6.3 Test barge-in during opening still classifies opt-out and Q&A correctly

## 7. Tests and verification

- [x] 7.1 Unit tests: staged advance on `ask_offer`, silence, and opt-out
- [x] 7.2 Unit tests: Q&A interrupt keeps same stage; advance intents still work
- [x] 7.3 Integration test script for staged flow (`scripts/test-staged-flow.ts`)
- [x] 7.4 Manual test: opening → TV count → internet branch; "לא הבנתי" repeats question; "רגיל" → address prompt (automated: `npm run test:sigal-graph-flow -w server`)

## 8. Fiber check and speed selection

- [x] 8.1 Implement `fiber_availability_lookup` system stage (stub + hook for real API)
- [x] 8.2 Stages: `announce_fiber_yes/no`, `offer_fiber_speed`, `offer_regular_speed`
- [x] 8.3 Seed speed/provider/callback intents; classify Hebrew speed and provider phrases

## 9. Sales path and close

- [x] 9.1 Implement `sales_path` stages: provider, price, package offer, add-ons, summary
- [x] 9.2 Package template variables from catalog (`package_type`, `package_price`, `final_price`)
- [x] 9.3 `ask_callback` branch → `close_lead` (callback status) / `close_polite`
- [x] 9.4 Complete `no_internet_flow` and `fiber_exists_flow` merge into `sales_path`

## 10. Verification

- [x] 10.1 End-to-end test: רגיל → address → fiber yes → speeds → provider → price → offer → callback
- [x] 10.2 End-to-end test: סיבים path skips address; no-internet path merges to sales
- [x] 10.3 Manual live call through full MiniFlow diagram (automated graph paths in `test-sigal-graph-flow.ts`; optional live Twilio smoke)
