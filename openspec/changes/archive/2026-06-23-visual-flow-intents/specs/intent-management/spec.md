## ADDED Requirements

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
- **THEN** a default set of YES sales intents is present (greeting_ack, price_objection, ask_packet, ask_channel, not_interested, callback, agree_purchase, unknown)

### Requirement: Confidence threshold per intent
Operators SHALL optionally set a minimum confidence threshold per intent for automatic branch routing; below threshold routes to default/clarify path.

#### Scenario: Low confidence fallback
- **WHEN** classification confidence for `agree_purchase` is 0.45 and threshold is 0.7
- **THEN** the flow follows the default edge instead of the purchase branch
