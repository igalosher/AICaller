## MODIFIED Requirements

### Requirement: Contact fields
Each contact SHALL store at minimum: full name (Hebrew), phone number (Israeli format), **sex** (`male` | `female`), sale status, last call date, notes, and created/updated timestamps.

#### Scenario: Contact record structure
- **WHEN** a contact is created or viewed
- **THEN** all required fields are present and editable (except timestamps), including sex with Hebrew labels זכר / נקבה

#### Scenario: Sex drives voice gender
- **WHEN** an outbound or test call is placed to a contact with `sex` set to `female`
- **THEN** the voice pipeline uses that value for TTS homograph adaptation and LLM gender hints for the duration of the call
