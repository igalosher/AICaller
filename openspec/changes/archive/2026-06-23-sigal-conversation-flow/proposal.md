## Why

The current YES starter flow jumps quickly into sales and ends calls on the first "not interested" signal. Customers expect a warmer, more human conversation—small talk, empathy, and polite handling of rudeness—while still getting accurate answers about channels, packets, internet, and equipment costs. The agent should have a consistent identity (**Sigal**) and a respectful two-step refusal flow before hanging up.

## What Changes

- Introduce **agent persona Sigal** with self-introduction at call opening ("מדברת סיגל מ-YES")
- Add **small-talk** flow section: respond naturally to "how are you?", mood questions, and other non-sales chat before/ alongside the pitch
- Add **insult/profanity handling**: respond in Hebrew that such language is not acceptable, then continue professionally or offer to end the call
- Expand **product Q&A** to fully cover channels (details per channel), packets, internet tier options, router rental costs, and comparison of alternatives when asked
- Implement **confirmed refusal**: on `not_interested`, ask "האם אתה בטוח?"; only if customer confirms → "תודה, יום טוב" and hang up with outcome `refused`
- Update **default starter graph** and **intent catalog** with new branches and example phrases
- Update **LLM system prompt** and knowledge tools for internet/router/options lookups

## Capabilities

### New Capabilities

- `agent-persona`: Sigal identity, opening script, consistent self-reference in Hebrew
- `conversational-tone`: Small talk, insult/profanity response, confirmed two-step refusal before hangup

### Modified Capabilities

- `hebrew-voice-ai`: Expanded catalog-backed Q&A (internet, router rental, options); persona-aware replies; tone rules
- `call-flow-configuration`: Starter graph with small-talk nodes, confirm-refusal branch, Sigal opening
- `intent-management`: New intents (`small_talk`, `insult_profanity`, `ask_internet`, `ask_router_rental`, `ask_options_compare`, `not_interested_confirm`, `not_interested_confirmed`)
- `sales-configuration`: Router rental and internet options indexed for AI Q&A
- `conversation-classification`: Classify small talk, insults, internet/router/options questions

## Impact

- **Server**: `starterFlow.ts`, `intentService` seeds, `llm.ts` system prompt, `productKnowledge` / `catalogChannelLookup`, `callService` refusal logic, optional new catalog fields for router rental
- **Client**: Flow builder may show updated default graph after publish; intent management new rows
- **Voice**: Opening TTS text change; new graph branches affect call duration and outcomes
- **No breaking API** changes; published flows pin at call start per existing versioning
