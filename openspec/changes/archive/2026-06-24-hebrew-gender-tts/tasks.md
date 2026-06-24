## 1. TTS pronunciation layer

- [x] 1.1 Add `hebrewTtsGender.ts` with `adaptHebrewTextForTts` and homograph registry (לך, אליך, שלך, איתך, עבורך, בשבילך)
- [x] 1.2 Extend `tts.ts` with `TtsOptions.addresseeSex`; apply adaptation before ElevenLabs POST
- [x] 1.3 Unit tests for male/female לך and transcript text unchanged

## 2. Pipeline wiring

- [x] 2.1 Pass `addresseeSex` from `call.contact.sex` in `speakOnCall`, `speakToBrowser`, `createPlayClip`, `playOnTwilioCall`
- [x] 2.2 Preload opening audio uses contact sex
- [x] 2.3 Browser test `onSessionStart` and `handleCustomerSpeech` pass sex

## 3. Grammar and LLM

- [x] 3.1 Add `genderHebrew.ts` — `resolveGenderMarkers` (`{{g:m|f}}`) and `genderPromptHint`
- [x] 3.2 Wire `customer_sex` in `templateVars` / `resolveTemplate`
- [x] 3.3 Add `customerSex` to `SalesReplyContext` and LLM system prompt
- [x] 3.4 Update default Sigal opening and key speak nodes with `{{g:|}}` where spelling differs

## 4. Verification

- [x] 4.1 Manual A/B: same script, male vs female contact — verify לך / אליך pronunciation on Twilio and test call
- [x] 4.2 Document ElevenLabs pronunciation-dictionary fallback in ops notes if niqqud insufficient
- [x] 4.3 Optional: flow-builder hint for `{{g:זכר|נקבה}}` in speak node editor
