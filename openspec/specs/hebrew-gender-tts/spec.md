# hebrew-gender-tts Specification

## Purpose
TBD - created by archiving change hebrew-gender-tts. Update Purpose after archive.
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

### Requirement: Homograph registry
The system SHALL maintain a central registry mapping homograph patterns to male and female TTS forms. The registry SHALL be unit-tested and extensible without changing call-flow logic.

#### Scenario: Add homograph
- **WHEN** a new homograph (e.g. "אליך") is added to the registry
- **THEN** all TTS entry points apply it automatically when `addresseeSex` is provided

### Requirement: Addressee sex on all TTS paths
Every code path that invokes ElevenLabs synthesis for an active call SHALL pass `addresseeSex` from the call's contact when available, including Twilio play, browser test WebSocket TTS, media-stream speak, and preloaded opening clips.

#### Scenario: Test call uses contact sex
- **WHEN** a browser test call speaks to a female contact
- **THEN** homograph adaptation uses `female` for that synthesis request
