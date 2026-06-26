# hebrew-gender-tts Specification

## Purpose
ElevenLabs does not infer Hebrew addressee gender. Before synthesis, the server adapts speak text using `contact.sex`: `{{g:}}` markers, slash forms (`מעוניין/ת`), homograph niqqud (לך, אליך, …), and common זכר/נקבה word pairs — without changing stored transcripts.

## Requirements
### Requirement: TTS homograph adaptation
The system SHALL adapt Hebrew second-person homographs for text-to-speech using the active contact's `sex` before sending text to ElevenLabs. Adaptation SHALL NOT modify stored transcripts, call summaries, or flow graph text.

#### Scenario: Male addressee — לך
- **WHEN** TTS synthesizes a prompt containing the word "לך" and `contact.sex` is `male`
- **THEN** the string sent to ElevenLabs uses the male niqqud form (e.g. לְךָ) and audio reflects *lecha* pronunciation

#### Scenario: Female addressee — לך
- **WHEN** TTS synthesizes a prompt containing "לך" and `contact.sex` is `female`
- **THEN** the string sent to ElevenLabs uses the female niqqud form (e.g. לָךְ) and audio reflects *lach* pronunciation

#### Scenario: Transcript unchanged
- **WHEN** a speak line containing "לך" is played to the customer
- **THEN** the transcript segment stored for the AI utterance retains standard spelling without niqqud

### Requirement: TTS pipeline resolves gender template markers
Before homograph adaptation, `adaptHebrewTextForTts` SHALL resolve `{{g:זכר|נקבה}}` markers using the addressee's `contact.sex`.

#### Scenario: Agent opening marker in TTS
- **WHEN** agent opening contains `{{g:מעוניין|מעוניינת}}` and TTS runs for a female contact
- **THEN** ElevenLabs receives the feminine form with niqqud

### Requirement: Slash gender forms in TTS
The TTS adapter SHALL resolve slash forms such as `מעוניין/ת` to the correct male or female word with niqqud based on addressee sex.

#### Scenario: Female slash form
- **WHEN** speak text contains `מעוניין/ת` and `contact.sex` is `female`
- **THEN** synthesis uses מְעוּנְיֶנֶת (or equivalent feminine niqqud)

### Requirement: Addressee verb and adjective niqqud
The registry SHALL include common second-person pairs (מעוניין/מעוניינת, תרצה/תרצי, אתה/את, אינך, …) with male and female niqqud applied at TTS time.

#### Scenario: LLM word normalized for TTS
- **WHEN** the AI reply contains `מעוניין` but the contact is female
- **THEN** TTS sends the feminine niqqud form to ElevenLabs

### Requirement: Homograph registry
The system SHALL maintain a central registry mapping homograph patterns and addressee gender word pairs to male and female niqqud TTS forms. The registry SHALL be unit-tested and extensible without changing call-flow logic.

#### Scenario: Add homograph
- **WHEN** a new homograph (e.g. "אינך") is added to the registry
- **THEN** all TTS entry points apply it automatically when `addresseeSex` is provided

### Requirement: Addressee sex on all TTS paths
Every code path that invokes ElevenLabs synthesis for an active call SHALL pass `addresseeSex` from the call's contact when available, including Twilio play, browser test WebSocket TTS, media-stream speak, and preloaded opening clips.

#### Scenario: Test call uses contact sex
- **WHEN** a browser test call speaks to a female contact
- **THEN** homograph adaptation uses `female` for that synthesis request
