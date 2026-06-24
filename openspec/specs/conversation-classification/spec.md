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
The graph flow runtime SHALL use the latest classification result to select the next node when the current node is `listen` or `intent_route`, and SHALL apply listen bindings before evaluating `decision` nodes that route on variables or lookups.

#### Scenario: Route on intent
- **WHEN** the active node is `listen` and classification returns `not_interested`
- **THEN** the engine follows the edge configured for `not_interested`

#### Scenario: Bind variable before decision
- **WHEN** the active node is `listen` with binding to `NumOfTVs`, classification returns `provide_tv_count` with `tv_count: 2`, and the next node is `decision`
- **THEN** `NumOfTVs` is set to `2` before decision edges are evaluated

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

### Requirement: Small talk and tone intents
The classifier SHALL support intents for conversational tone: `small_talk`, `insult_profanity`, and refusal confirmation `not_interested_confirmed`.

#### Scenario: Classify small talk
- **WHEN** a customer says "מה נשמע?"
- **THEN** classification returns `small_talk` with sufficient confidence for routing

#### Scenario: Classify insult
- **WHEN** a customer uses abusive or profane language
- **THEN** classification returns `insult_profanity`

#### Scenario: Classify confirmed refusal
- **WHEN** after a confirmation question the customer says "כן, לא מעוניין" or "בטוח"
- **THEN** classification returns `not_interested_confirmed`

### Requirement: Product question intents
The classifier SHALL support `ask_internet`, `ask_router_rental`, and `ask_options_compare` for non-channel product questions.

#### Scenario: Classify internet question
- **WHEN** a customer asks "מה מהירות האינטרנט?" or "אילו אפשרויות אינטרנט יש?"
- **THEN** classification returns `ask_internet`

#### Scenario: Classify router rental question
- **WHEN** a customer asks "כמה עולה לשכור נתב?" or "מה המחיר של הנתב?"
- **THEN** classification returns `ask_router_rental`

#### Scenario: Classify options comparison
- **WHEN** a customer asks "מה האפשרויות?" or "מה ההבדל בין החבילות?"
- **THEN** classification returns `ask_options_compare`

### Requirement: Opt-out and offer intents
The classifier SHALL support `opt_out_remove` for legal opt-out ("הסר") and `ask_offer` for offer questions such as "מה ההצעה".

#### Scenario: Classify opt-out
- **WHEN** a customer says "הסר" or equivalent remove-me phrasing
- **THEN** classification returns `opt_out_remove` with sufficient confidence for immediate opt-out handling

#### Scenario: Classify offer question
- **WHEN** a customer says "מה ההצעה" or similar offer-request phrasing
- **THEN** classification returns `ask_offer`

### Requirement: Listen-scoped qualification intents
During graph-flow calls, qualification intents (e.g. `provide_tv_count`, `internet_regular`, `provide_address`) SHALL apply only when listed in the active listen checkpoint scope, derived from outgoing route edge intent ids and listen variable bindings.

#### Scenario: TV count only at TV listen
- **WHEN** the active listen checkpoint is `listen_tv` and the customer says "רגיל"
- **THEN** `internet_regular` is not applied from global examples; the utterance is classified without that qualification intent unless another rule matches

#### Scenario: Internet regular at internet listen
- **WHEN** the active listen checkpoint is `listen_inet` and the customer says "רגיל"
- **THEN** classification returns `internet_regular` with sufficient confidence for main-route advance

### Requirement: Classification uses engine listen checkpoint
The classifier options for a customer turn SHALL resolve scoped intents from the session engine's listen checkpoint when available, not only from persisted `currentNodeId`.

#### Scenario: Scope matches engine position
- **WHEN** the session engine is on `listen_inet` or its following `route_inet`
- **THEN** scoped answer intents include `internet_regular`, `internet_fiber`, and related route intents

### Requirement: Qualification and address intents
The classifier SHALL support qualification intents: `provide_tv_count` (numeric TV count), `internet_regular`, `internet_fiber`, `internet_unknown`, `no_internet`, and `provide_address`. These intents SHALL respect listen scope when `scopedAnswerIntents` is provided.

#### Scenario: Classify TV count
- **WHEN** a customer says "שתי טלויזיות" or "2" at a TV-count listen checkpoint
- **THEN** classification returns `provide_tv_count` with entity `tv_count`

#### Scenario: Classify regular internet
- **WHEN** a customer says "רגיל" or "אינטרנט רגיל" at an internet-type listen checkpoint
- **THEN** classification returns `internet_regular`

#### Scenario: Classify fiber internet
- **WHEN** a customer says "סיבים" or "סיבים אופטיים"
- **THEN** classification returns `internet_fiber`

#### Scenario: Classify unknown internet
- **WHEN** a customer says "לא יודע" or "לא בטוח"
- **THEN** classification returns `internet_unknown`

#### Scenario: Classify no internet
- **WHEN** a customer says "אין לי אינטרנט"
- **THEN** classification returns `no_internet`

#### Scenario: Classify address provision
- **WHEN** a customer provides a street address after the fiber check prompt at an address listen checkpoint
- **THEN** classification returns `provide_address` with captured address text

### Requirement: Speed and provider intents
The classifier SHALL support speed selection (`select_speed_100`, `select_speed_200`, `select_speed_300`, `select_speed_600`, `select_speed_1000`), provider (`provider_bezeq`, `provider_hot`, `provider_partner`, `provider_cellcom`, `provider_other`), `provide_current_price`, `select_addons`, `decline_addons`, `agree_callback`, and `decline_callback`.

#### Scenario: Classify provider Bezeq
- **WHEN** a customer says "בזק"
- **THEN** classification returns `provider_bezeq`

#### Scenario: Classify current price
- **WHEN** a customer says "משלם מאה וחמישים שקל"
- **THEN** classification returns `provide_current_price` with entity `monthly_price`

#### Scenario: Classify callback agreement
- **WHEN** a customer says "כן, תחזרו אליי"
- **THEN** classification returns `agree_callback`

### Requirement: Confusion intent
The classifier SHALL support `didnt_understand` for "לא הבנתי", "מה?", and similar repeat-request phrases. This intent SHALL take precedence over product Q&A classification when matched.

#### Scenario: Classify didn't understand
- **WHEN** a customer says "לא הבנתי" or "מה?"
- **THEN** classification returns `didnt_understand`

### Requirement: Silence as advance signal
When a staged stage configures `silenceAdvanceSec`, the listen handler SHALL emit a synthetic `silence` classification if no final transcript arrives within that window.

#### Scenario: Silence after opening
- **WHEN** stage `opening` has `silenceAdvanceSec` configured and the customer does not speak within that window
- **THEN** the runtime treats the event as `silence` for stage advance rules

### Requirement: Entity-to-variable mapping via listen bindings
When a flow listen node defines variable bindings, the classification pipeline SHALL expose extracted entities in a form the runtime can assign to the bound variable names without additional hard-coded mapping per flow.

#### Scenario: TV count entity available for binding
- **WHEN** customer speech is classified as `provide_tv_count` with entity `tv_count: 4`
- **THEN** classification metadata includes `entities.tv_count` as number `4` for binding to `NumOfTVs`

#### Scenario: Address entity available for binding
- **WHEN** customer speech is classified as `provide_address` with entity `address: "רחוב בן גוריון 10"`
- **THEN** classification metadata includes `entities.address` for binding to a string flow variable

