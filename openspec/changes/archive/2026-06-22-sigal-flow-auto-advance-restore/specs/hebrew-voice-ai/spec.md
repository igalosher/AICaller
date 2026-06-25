## ADDED Requirements

### Requirement: Operator-authored niqqud in speak templates
Speak node templates MAY include Hebrew niqqud (vocalization marks) for correct pronunciation of names and fixed phrases. The TTS pipeline SHALL pass operator-authored niqqud through to synthesis unless a separate homograph adapter overrides a specific token.

#### Scenario: Niqqud in opening reaches TTS
- **WHEN** `speak_opening` contains niqqud on the agent name (e.g. סִגׇּל)
- **THEN** the string sent to ElevenLabs retains those marks for pronunciation

#### Scenario: Transcript retains operator spelling
- **WHEN** the AI speaks a line with operator-authored niqqud
- **THEN** the stored transcript matches the speak node template text as configured in the flow
