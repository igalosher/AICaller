# conversation-classification Specification

## Purpose
TBD - created by archiving change visual-flow-intents. Update Purpose after archive.
## Requirements
### Requirement: Real-time utterance classification
On each final customer transcript segment during a call, the system SHALL classify the utterance with a primary intent id, confidence score, and optional structured entities.

#### Scenario: Classify price question
- **WHEN** a customer says "כמה זה עולה לחודש?"
- **THEN** the utterance is classified as `price_objection` or `ask_price` with confidence stored on the transcript segment

#### Scenario: Extract channel entity
- **WHEN** a customer asks "יש לכם את ערוץ ספורט 5?"
- **THEN** classification includes entity `channel: "ספורט 5"` (or matched catalog channel id)

### Requirement: Classification persistence
Each customer transcript segment SHALL store classification metadata: `intentId`, `confidence`, `entitiesJson`, and `classifier` (rule | llm).

#### Scenario: Post-call review
- **WHEN** an operator opens a completed call transcript
- **THEN** each customer line shows intent label and confidence badge

### Requirement: Classification drives flow navigation
The graph flow runtime SHALL use the latest classification result to select the next node when the current node is `listen` or `intent_route`.

#### Scenario: Route on intent
- **WHEN** the active node is `listen` and classification returns `not_interested`
- **THEN** the engine follows the edge configured for `not_interested`

### Requirement: Unknown intent handling
When no intent meets the confidence threshold, the system SHALL assign `unknown` and follow the default branch or a configured clarify speak node.

#### Scenario: Unclear speech
- **WHEN** customer speech is classified as `unknown`
- **THEN** the flow advances via the default edge and the AI may ask a clarifying question per node configuration

### Requirement: Classification audit log
The system SHALL log classification inputs and outputs for debugging (utterance text, matched rule id if any, LLM raw response) retained for 30 days per call.

#### Scenario: Operator debug mis-route
- **WHEN** an operator views classification details on a transcript line
- **THEN** they see which rule or LLM response produced the intent label

