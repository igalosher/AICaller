## Context

Alpha v2 has graph-based flows, intent classification, and channel/packet Q&A. The starter flow opens as a generic "נציגת YES" and routes `not_interested` directly to a goodbye node. LLM context includes packets but internet tiers and router rental are thin or missing from prompts. Users want Sigal—a named, warmer agent—with small talk, abuse handling, richer product answers, and a confirmation step before ending on refusal.

Constraints: Hebrew RTL, ElevenLabs TTS, existing `GraphFlowEngine`, YES catalog JSON, SQLite.

## Goals / Non-Goals

**Goals:**
- Sigal introduces herself on every new call opening speak node
- Small-talk intents route to empathetic non-sales replies, then gently return toward qualification when appropriate
- Insults/profanity trigger a fixed polite boundary response (configurable speak node), not escalation
- Any channel/packet/internet/router/options question gets catalog-backed answers via existing + extended knowledge tools
- Two-step refusal: `not_interested` → confirm node → `not_interested_confirmed` → end call; ambiguous re-engagement returns to pitch
- Updated starter graph and intent seeds shipped on deploy/seed

**Non-Goals:**
- Sentiment analysis ML model training
- Operator-editable persona name in UI (hardcode Sigal for this change; settings later)
- Legal moderation / call recording disclaimers beyond existing opening
- Replacing LLM for small talk with scripted-only responses (hybrid: short templates + LLM fill)

## Decisions

### 1. Persona in opening template + LLM system prompt

**Decision:** Opening speak node text: `שלום {{customer_first_name}}, מדברת סיגל מ-YES. … האם אוכל להציע לך כמה מבצעים מיוחדים?` Qualification follows with deal options (TV, internet, bundles)—not "are you interested to buy." `SYSTEM_PROMPT` in `llm.ts` names Sigal and sets tone (warm, professional, Hebrew).

**Rationale:** Single source for TTS opening; LLM stays consistent mid-call.

**Alternatives:** Per-node persona field (deferred).

### 2. New intents + graph branches (not free-form LLM routing)

**Decision:** Add intents `small_talk`, `insult_profanity`, `ask_internet`, `ask_router_rental`, `ask_options_compare`, `not_interested_confirm` (system state), `not_interested_confirmed`. Graph adds:
- `small_talk_reply` speak node after route
- `insult_reply` speak node
- `confirm_refusal` speak: "האם אתה בטוח שאתה לא מעוניין?"
- `listen_confirm` → route: `greeting_ack`/continue vs `not_interested_confirmed` → `end_refused`

**Rationale:** Matches existing intent-route pattern; operators can tune in flow builder.

### 3. Confirmed refusal as graph state, not only LLM outcome

**Decision:** First `not_interested` edge goes to `confirm_refusal`, not `end_refused`. Only `not_interested_confirmed` (or second `not_interested` while on confirm node) ends call.

**Rationale:** User requirement explicit; testable in graph engine tests.

### 4. Extended product knowledge

**Decision:** Extend `yes-catalog.json` parsing and `productKnowledge` with:
- `list_internet_tiers()` / `describe_internet(name)`
- `router_rental_info()` from catalog notes or dedicated catalog section if present; fallback configurable constant in seed
- `compare_options(query)` returns active packets + tiers summary

**Rationale:** Reduces hallucination on price questions.

### 5. Insult detection: rules first

**Decision:** Rule list of Hebrew profanity/insult patterns → intent `insult_profanity` with high confidence; LLM fallback for edge cases.

**Rationale:** Fast, operator-extendable via intent examples.

## Risks / Trade-offs

- **[Risk] Small talk prolongs calls** → Mitigation: soft bridge phrase back to offer after one exchange
- **[Risk] Double confirmation annoys angry customers** → Mitigation: single short confirm question only
- **[Risk] Router rental not in catalog** → Mitigation: seed default Hebrew answer from YES public pricing note; operator can edit in sales config later
- **[Risk] Breaking published flows** → Mitigation: publish new graph version; in-flight calls keep old version

## Migration Plan

1. Seed new intents and examples
2. Replace `createDefaultStarterFlow()` and migrate active flow `publishedGraphJson` via seed helper if graph version &lt; 2
3. Deploy server; operators re-publish from flow builder if they customized graph
4. Rollback: revert graph JSON and intent seeds

## Open Questions

- Exact router rental price source in catalog (parse from `הערות` or add `ציוד` section to `yes-catalog.json`)
- Should small talk be mandatory before pitch or only when customer initiates? **Decision:** only when customer initiates (intent branch)
