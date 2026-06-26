## ADDED Requirements

### Requirement: TTS pipeline resolves gender template markers
Before homograph niqqud adaptation, `adaptHebrewTextForTts` SHALL resolve `{{g:זכר|נקבה}}` markers using the addressee's `contact.sex`.

#### Scenario: Agent opening marker in TTS
- **WHEN** agent opening template contains `{{g:מעוניין|מעוניינת}}` and TTS runs for a female contact
- **THEN** ElevenLabs receives the feminine word form with niqqud (e.g. מְעוּנְיֶנֶת)

### Requirement: Slash gender forms in TTS
The TTS adapter SHALL resolve Hebrew slash forms such as `מעוניין/ת` to the male or female word (then niqqud) based on addressee sex.

#### Scenario: Male slash form
- **WHEN** speak text contains `מעוניין/ת` and `contact.sex` is `male`
- **THEN** synthesis uses the male form with niqqud (מְעוּנְיָן)

#### Scenario: Female slash form
- **WHEN** speak text contains `מעוניין/ת` and `contact.sex` is `female`
- **THEN** synthesis uses the feminine form with niqqud (מְעוּנְיֶנֶת)

### Requirement: Addressee verb and adjective niqqud
The homograph registry SHALL include common second-person addressee pairs (e.g. מעוניין/מעוניינת, תרצה/תרצי, אתה/את, אינך) with male and female niqqud forms applied at TTS time based on `contact.sex`.

#### Scenario: Wrong-gender LLM word corrected for TTS
- **WHEN** the AI reply contains `מעוניין` but the contact is female
- **THEN** TTS still sends the feminine niqqud form (מְעוּנְיֶנֶת) to ElevenLabs

## MODIFIED Requirements

### Requirement: Homograph registry
The system SHALL maintain a central registry mapping homograph patterns and addressee gender word pairs to male and female niqqud TTS forms. The registry SHALL be unit-tested and extensible without changing call-flow logic.

#### Scenario: Add homograph
- **WHEN** a new homograph (e.g. "אינך") is added to the registry
- **THEN** all TTS entry points apply it automatically when `addresseeSex` is provided
