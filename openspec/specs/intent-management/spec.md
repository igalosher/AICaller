# intent-management Specification

## Purpose
TBD - created by archiving change visual-flow-intents. Update Purpose after archive.
## Requirements
### Requirement: Intent catalog
The system SHALL maintain a catalog of intents (id, Hebrew label, description, category, active flag) used for flow branching and classification.

#### Scenario: Create custom intent
- **WHEN** an operator adds intent `ask_channel` with label "שאלה על ערוץ ספציפי"
- **THEN** the intent appears in the flow builder branch picker and classification output

#### Scenario: Deactivate intent
- **WHEN** an operator deactivates an intent
- **THEN** it is hidden from new flow edges but historical classifications remain readable

### Requirement: Intent example phrases
Operators SHALL attach Hebrew example phrases to each intent that improve rule-based and LLM classification.

#### Scenario: Add example phrase
- **WHEN** an operator adds "האם יש ספורט 5?" as an example for `ask_channel`
- **THEN** similar utterances are more likely classified as `ask_channel`

#### Scenario: Edit mapping from call review
- **WHEN** an operator re-labels a transcript utterance from `unknown` to `price_objection` and chooses "הוסף כדוגמה לכוונה"
- **THEN** the phrase is saved to `price_objection` examples for future calls

### Requirement: Intent management screen
The application SHALL provide a dedicated Intent Management screen (ניהול כוונות) separate from the flow builder, listing intents, examples, and usage count.

#### Scenario: Browse intents
- **WHEN** an operator opens ניהול כוונות
- **THEN** all intents are listed with label, category, example count, and last-used timestamp

#### Scenario: Bulk import starter intents
- **WHEN** the application is seeded or reset
- **THEN** a default set of YES sales intents is present, including: `greeting_ack`, `price_objection`, `ask_packet`, `ask_channel`, `not_interested`, `callback`, `agree_purchase`, `unknown`, `small_talk`, `insult_profanity`, `ask_internet`, `ask_router_rental`, `ask_options_compare`, `not_interested_confirmed`, `opt_out_remove`, and `ask_offer`

#### Scenario: Seed includes tone intents
- **WHEN** seed runs on a fresh database
- **THEN** intents `small_talk` and `insult_profanity` exist with Hebrew example phrases

#### Scenario: Seed includes expanded product intents
- **WHEN** seed runs on a fresh database
- **THEN** intents `ask_internet`, `ask_router_rental`, and `ask_options_compare` exist with Hebrew examples

#### Scenario: Seed includes opt-out and offer intents
- **WHEN** seed runs on a fresh database
- **THEN** intents `opt_out_remove` (examples: "הסר", "תסירו אותי") and `ask_offer` (examples: "מה ההצעה", "תספרי על ההצעה") exist with Hebrew examples

#### Scenario: Seed includes qualification intents
- **WHEN** seed runs on a fresh database
- **THEN** intents `didnt_understand`, `provide_tv_count`, `internet_regular`, `internet_fiber`, `internet_unknown`, `no_internet`, and `provide_address` exist with Hebrew examples

### Requirement: Confidence threshold per intent
Operators SHALL optionally set a minimum confidence threshold per intent for automatic branch routing; below threshold routes to default/clarify path.

#### Scenario: Low confidence fallback
- **WHEN** classification confidence for `agree_purchase` is 0.45 and threshold is 0.7
- **THEN** the flow follows the default edge instead of the purchase branch

