## MODIFIED Requirements

### Requirement: Intent management screen
The application SHALL provide a dedicated Intent Management screen (ניהול כוונות) separate from the flow builder, listing intents, examples, and usage count.

#### Scenario: Browse intents
- **WHEN** an operator opens ניהול כוונות
- **THEN** all intents are listed with label, category, example count, and last-used timestamp

#### Scenario: Bulk import starter intents
- **WHEN** the application is seeded or reset
- **THEN** a default set of YES sales intents is present, including: `greeting_ack`, `price_objection`, `ask_packet`, `ask_channel`, `not_interested`, `callback`, `agree_purchase`, `unknown`, `small_talk`, `insult_profanity`, `ask_internet`, `ask_router_rental`, `ask_options_compare`, and `not_interested_confirmed`

#### Scenario: Seed includes tone intents
- **WHEN** seed runs on a fresh database
- **THEN** intents `small_talk` and `insult_profanity` exist with Hebrew example phrases

#### Scenario: Seed includes expanded product intents
- **WHEN** seed runs on a fresh database
- **THEN** intents `ask_internet`, `ask_router_rental`, and `ask_options_compare` exist with Hebrew examples
