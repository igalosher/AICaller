## 1. Agent persona and LLM

- [x] 1.1 Update `llm.ts` SYSTEM_PROMPT: agent name Sigal, tone (warm, professional), insult boundary, confirmed refusal behavior
- [x] 1.2 Update default opening in `starterFlow.ts` and seed: "שלום {{customer_first_name}}, מדברת סיגל מ-YES..."
- [x] 1.3 Add `{{agent_name}}` template variable defaulting to "סיגל" in `template.ts` (optional use in speak nodes)

## 2. Intents and classification

- [x] 2.1 Seed new intents: `small_talk`, `insult_profanity`, `ask_internet`, `ask_router_rental`, `ask_options_compare`, `not_interested_confirmed` with Hebrew examples
- [x] 2.2 Add rule patterns for profanity/insults and small-talk phrases in `intentService.ts`
- [x] 2.3 Distinguish first `not_interested` vs `not_interested_confirmed` in classifier (context: on confirm node)

## 3. Product knowledge

- [x] 3.1 Add `listInternetTiers`, `describeInternet`, `routerRentalInfo`, `compareOptions` to `productKnowledge` / catalog parser
- [x] 3.2 Parse router rental from `yes-catalog.json` (or seed default Hebrew answer if missing)
- [x] 3.3 Wire new tools into LLM context in `callService` / `llm.ts` for relevant intents

## 4. Flow graph and runtime

- [x] 4.1 Update `createDefaultStarterFlow()`: small_talk branch, insult_reply branch, internet/router/options Q&A nodes
- [x] 4.2 Replace direct `not_interested` → end with confirm_refusal → listen → route → end_refused or back to pitch
- [x] 4.3 Update `callService` graph turn: honor confirm-refusal state; hang up only on `not_interested_confirmed`
- [x] 4.4 Migration in seed: upgrade active flow published graph if still on pre-Sigal template

## 5. Testing

- [x] 5.1 Extend `test-visual-flow.ts`: small_talk routing, insult intent, confirm-refusal two-step, internet/router Q&A lookup
- [ ] 5.2 Manual test: opening says Sigal; "לא מעוניין" twice ends call; channel question answered from catalog

## 6. Publish

- [x] 6.1 Publish updated graph via seed or document operator re-publish in flow builder
