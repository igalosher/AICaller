# Hebrew gender TTS — operations

## How it works

- Contact **sex** (`male` / `female`) drives TTS pronunciation for homographs (same spelling, different sound).
- Before each ElevenLabs request, `adaptHebrewTextForTts()` adds niqqud hints (e.g. `לך` → `לְךָ` / `לָךְ`).
- Transcripts and flow text stay in standard orthography — niqqud is never stored.
- Where **spelling** differs (תרצה / תרצי), flow authors use `{{g:תרצה|תרצי}}` in speak nodes.

## Verify

```bash
cd server
npx tsx scripts/test-hebrew-gender-tts.ts
```

Then run a manual A/B on test call or Twilio with male vs female contacts (see script output checklist).

## ElevenLabs pronunciation dictionary (fallback)

ElevenLabs v3 has **no addressee-gender API**. Primary tuning is niqqud in the TTS string. If a homograph still sounds wrong after a model or voice upgrade:

1. Open [ElevenLabs Studio](https://elevenlabs.io) → **Pronunciation dictionaries**.
2. Create or edit a dictionary for the Sigal voice / Hebrew project.
3. Add **alias** rules for the stubborn word, e.g. map `לך` → a phonetic spelling or niqqud form that the current model reads correctly for male vs female contexts.
4. Attach the dictionary to TTS requests via `pronunciation_dictionary_locators` on the convert endpoint (not wired in app v1 — optional future `ELEVENLABS_PRONUNCIATION_DICTIONARY_ID` env).

### When to use dictionary vs code registry

| Approach | Use when |
|----------|----------|
| `hebrewTtsGender.ts` registry | New homograph, same logic for all voices |
| ElevenLabs dictionary | Model-specific drift; one word needs a custom alias after niqqud fails |

### Extending the homograph list

Edit `server/src/utils/hebrewTtsGender.ts` (`PRONUNCIATION_FORMS`). Use word-boundary regex. Run `npm run test:hebrew-gender-tts` after changes.
