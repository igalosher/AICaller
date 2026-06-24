## Context

Contacts have `sex: male | female` (Prisma `ContactSex`). Flow speak nodes and transcripts use standard Hebrew without niqqud. ElevenLabs v3 (`eleven_v3`, `language_code: he`) synthesizes whatever string is POSTed to `/v1/text-to-speech/{voice_id}`. There is **no** addressee-gender API parameter. SSML phonemes are English-centric; for Hebrew, ElevenLabs recommends **alias tags** in pronunciation dictionaries or spelling/niqqud hints in the text sent to the model.

Two distinct gender problems exist:

| Problem | Example | Solution layer |
|--------|---------|----------------|
| **Different spelling** | תרצה / תרצי | Flow `{{g:תרצה\|תרצי}}` or LLM |
| **Same spelling, different sound** | לך (lecha / lach) | TTS-only niqqud adaptation |

## Goals / Non-Goals

**Goals:**

- Pronounce second-person homographs correctly from `contact.sex` on all TTS paths (Twilio, browser test, mock)
- Keep **one canonical transcript** — no niqqud in `CallTranscriptSegment` or operator-facing flow text
- Pass `customerSex` into LLM for dynamic replies and Q&A interrupts
- Central, testable homograph registry easy to extend

**Non-Goals:**

- Automatic morphological analysis of arbitrary Hebrew (no NLP gender inflector)
- Per-word ElevenLabs pronunciation dictionary management in app UI (document as ops fallback)
- Gender-neutral Hebrew reformulation of entire scripts
- Changing ElevenLabs voice per sex (same Sigal voice for all)

## Decisions

### 1. TTS-only adaptation (`adaptHebrewTextForTts`)

**Choice:** Immediately before `synthesizeSpeech`, run `adaptHebrewTextForTts(text, contact.sex)` which replaces known homographs with niqqud forms.

**Rationale:** Same visible text, different audio. Niqqud is widely supported by v3 Hebrew and does not pollute transcripts.

**Initial homograph set:** לך, אליך/אלייך, שלך, איתך, עבורך, בשבילך (word-boundary regex).

**Alternative considered:** Send different spellings in flow (לכה/לאך) — rejected; pollutes transcript and is non-standard orthography.

### 2. `TtsOptions.addresseeSex` threaded from call contact

**Choice:** Extend `synthesizeHebrewSpeech` / `synthesizeHebrewSpeechMp3` with optional `{ addresseeSex }`. Call sites that know `call.contact.sex` pass it; default `male` if missing.

**Rationale:** Explicit, no global call-context magic. `playOnTwilioCall` loads contact; `handleCustomerSpeech` already loads call.

### 3. Separate grammar markers for spelled differences (`{{g:m|f}}`)

**Choice:** `resolveGenderMarkers` in `resolveTemplate` when `customer_sex` is in template vars.

**Rationale:** Orthogonal to TTS homographs. Opening lines like "לא תרצה" vs "לא תרצי" need different characters, not just niqqud.

### 4. LLM `genderPromptHint`

**Choice:** Add `customerSex` to `SalesReplyContext`; inject Hebrew instruction into system message.

**Rationale:** Interrupt Q&A and `useLlm` nodes are not fully scripted; LLM must inflect verbs/adjectives correctly.

### 5. ElevenLabs pronunciation dictionary (ops fallback)

**Choice:** Document in runbook; not automated in v1.

**Rationale:** If niqqud fails for a voice/model combo, operators add alias rules in ElevenLabs Studio. API supports `pronunciation_dictionary_locators` on convert — future enhancement.

## Architecture

```
Flow speak text + templates
        ↓ resolveTemplate ({{vars}}, {{g:m|f}})
        ↓ stored in transcript as-is
        ↓
adaptHebrewTextForTts(text, contact.sex)   ← only here
        ↓
ElevenLabs eleven_v3 (language_code: he)
```

LLM path: `generateSalesReply` uses same resolved `stagePrompt` for context but generates new text with `genderPromptHint`.

## Risks / Trade-offs

- **Incomplete homograph list** — wrong pronunciation for unlisted words until added to registry or dictionary
- **Regex false positives** — mitigated by word-boundary patterns; review new entries
- **Niqqud + model drift** — verify on ElevenLabs upgrades; keep dictionary fallback
- **Default male** when sex missing — matches Prisma `@default(male)`

## Open Questions

- Should flow builder show a short hint: "לך is pronounced via contact sex; use {{g:|}} when spelling changes"?
- Wire ElevenLabs pronunciation dictionary ID via env for production tuning?
