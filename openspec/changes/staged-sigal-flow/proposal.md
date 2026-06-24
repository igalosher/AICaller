## Why

The current graph-based Sigal flow branches freely by intent and is hard to script as a compliant outbound opener with legal opt-out (“הסר”), prior-interest context, and a clear stage-by-stage sales narrative. Operators need a **defined call script** that advances one stage at a time while still allowing customers to ask product questions at any moment without losing their place in the script.

## What Changes

- Replace the default outbound experience with a **staged linear flow** (stage 1 defined now; later stages added iteratively with the product owner)
- Add a **global Q&A interrupt layer**: at any stage, questions about packages, channels, internet, or promotions are answered from catalog/knowledge, then the call **resumes the same stage** (or advances only when stage rules say so)
- New **opening stage** script (Hebrew): greet by first + family name, Sigal digital assistant from YES, prior-interest hook, attractive pricing + joining gift, opt-out via “הסר”, and notice that questions are welcome at every stage
- **`הסר` handling**: polite goodbye (“תודה רבה ויום נעים”), hang up, contact status **`blacklisted`** (excluded from future outbound)
- **Stage-1 advance triggers**: customer asks “מה ההצעה” (or similar offer intent) **or** silence timeout → TV-count qualification
- **Qualification**: ask TV count (numeric answer) → ask internet type (רגיל / סיבים / לא יודע / אין לי אינטרנט) → branch into sub-flows
- **Global repeat**: “לא הבנתי” or “מה?” → re-speak last statement, stay on current stage
- **Fiber check**: address → availability → fiber speeds (300/600/1GB) or regular (100/200MB)
- **Sales path**: current provider → current price → triple/double offer → add-ons → summary → callback ask
- **Close**: agree → `callback` status (Lead); decline → polite end
- **BREAKING**: Default published flow moves from intent-routed graph-first to **staged script + interrupt Q&A** as the primary runtime model (graph builder may remain for advanced customization later)

## Capabilities

### New Capabilities

- `staged-conversation-flow`: Linear stage machine with persisted stage index, scripted speak nodes per stage, and explicit advance rules per stage
- `flow-qa-interrupt`: Global product Q&A handler that answers outside the stage script and returns to the saved stage checkpoint

### Modified Capabilities

- `agent-persona`: Opening identifies Sigal as digital assistant; full-name greeting; compliance/opt-out language
- `call-flow-configuration`: Default flow is staged script (not the current Sigal graph); stage definitions and advance rules
- `conversation-classification`: Classify `opt_out_remove`, `ask_offer`, `didnt_understand`, `provide_tv_count`, internet-type intents, `provide_address`, silence, and product Q&A for interrupt routing
- `contact-management`: New status `blacklisted`; excluded from all outbound queues; operator can view/change status
- `hebrew-voice-ai`: Stage-script TTS + interrupt answers; goodbye on opt-out
- `intent-management`: Seed `opt_out_remove`, `ask_offer`, `didnt_understand`, `provide_tv_count`, `internet_regular`, `internet_fiber`, `internet_unknown`, `no_internet`, `provide_address`
- `telephony-outbound`: Skip `blacklisted` contacts on dial / call-next

## Impact

- **Server**: New or refactored `stagedFlowEngine` (or extend `callService`), stage definitions config, silence detection hook, blacklist status in Prisma + `contactStatus.ts`, opening template and seed migration
- **Client**: Contact status UI shows `blacklisted`; optional stage preview in flow settings (later)
- **Voice / Twilio**: Longer opening TTS; silence timer on listen nodes; opt-out ends call immediately
- **Data**: Prisma `ContactStatus` enum extension; migration for existing contacts
- **OpenSpec**: Supersedes much of the archived Sigal graph-first default; graph engine kept but not default path
