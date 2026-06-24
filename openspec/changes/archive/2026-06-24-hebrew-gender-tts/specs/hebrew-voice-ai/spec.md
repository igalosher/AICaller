## MODIFIED Requirements

### Requirement: Hebrew speech output
The AI caller SHALL speak Hebrew using natural-sounding text-to-speech suitable for telephony (8 kHz or higher, clear pronunciation of Israeli Hebrew). Synthesis SHALL respect the **addressee's gender** (`contact.sex`) for homographic second-person forms (same spelling, different pronunciation).

#### Scenario: AI delivers pitch in Hebrew
- **WHEN** the AI presents a sales packet during a call
- **THEN** the customer hears fluent Hebrew audio over the phone line

#### Scenario: Gender-appropriate homograph pronunciation
- **WHEN** the scripted prompt includes "לך" and the contact is female
- **THEN** the customer hears female second-person pronunciation (*lach*), not male (*lecha*)
