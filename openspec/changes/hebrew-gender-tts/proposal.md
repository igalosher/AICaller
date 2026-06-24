## Why

Hebrew sales calls must address the customer in gender-appropriate language. Many second-person forms are **homographs** — written identically (e.g. **לך**) but pronounced differently for male (*lecha*) vs female (*lach*). Contact records already store `sex` (זכר/נקבה), but ElevenLabs TTS receives plain text with no addressee-gender control and often guesses wrong. Transcripts and flow scripts should stay in standard orthography; only synthesis and LLM replies need gender awareness.

## What Changes

- **TTS pronunciation layer**: Before every ElevenLabs request, adapt homographs using niqqud hints driven by `contact.sex` (e.g. `לך` → `לְךָ` / `לָךְ`). Transcript and UI text remain unchanged.
- **Plumb `addresseeSex` through the voice pipeline**: Twilio play, browser test call, media stream, and opening preload all pass the active contact's sex into `synthesizeHebrewSpeech*`.
- **LLM gender context**: `generateSalesReply` receives `customerSex` and a system hint so improvised answers use correct grammar (תרצה/תרצי, etc.).
- **Flow template markers (orthogonal)**: Support `{{g:זכר|נקבה}}` in speak templates where **spelling** differs (not pronunciation-only homographs).
- **Extensible homograph map**: Central list of regex + male/female niqqud forms; optional future ElevenLabs pronunciation-dictionary aliases for stubborn words.
- **Contact spec alignment**: Document `sex` on contacts as input to voice gender adaptation.

## Capabilities

### New Capabilities

- `hebrew-gender-tts`: TTS-only Hebrew homograph adaptation, `TtsOptions.addresseeSex`, homograph registry, separation of display text vs synthesis text

### Modified Capabilities

- `hebrew-voice-ai`: Hebrew speech output SHALL reflect addressee gender for homographs and scripted prompts
- `contact-management`: Contacts SHALL store `sex` (`male` | `female`) used by voice and LLM layers
- `agent-persona`: LLM replies SHALL use gender-appropriate Hebrew when addressing the customer

## Impact

- **Server**: `hebrewTtsGender.ts`, `genderHebrew.ts`, `tts.ts` (`TtsOptions`), `callService.ts`, `mediaSession.ts`, `browserTestSession.ts`, `playAudio.ts`, `twilioPlay.ts`, `template.ts`, `llm.ts`, `stagedFlowRuntime.ts`
- **Client**: No change required (sex already on contact form); optional future flow-builder hint for `{{g:|}}`
- **ElevenLabs**: Still `eleven_v3` + `language_code: he`; no API gender parameter — niqqud / dictionary aliases only
- **Data**: Uses existing `Contact.sex` column; no schema migration
- **Tests**: Unit tests for `adaptHebrewTextForTts` and template `{{g:|}}` resolution; manual A/B on לך / אליך / שלך with male vs female contacts
