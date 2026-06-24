## ADDED Requirements

### Requirement: Opt-out and offer intents
The classifier SHALL support `opt_out_remove` for legal opt-out ("הסר") and `ask_offer` for offer questions such as "מה ההצעה".

#### Scenario: Classify opt-out
- **WHEN** a customer says "הסר" or equivalent remove-me phrasing
- **THEN** classification returns `opt_out_remove` with sufficient confidence for immediate opt-out handling

#### Scenario: Classify offer question
- **WHEN** a customer says "מה ההצעה" or similar offer-request phrasing
- **THEN** classification returns `ask_offer`

### Requirement: Qualification and address intents
The classifier SHALL support qualification intents: `provide_tv_count` (numeric TV count), `internet_regular`, `internet_fiber`, `internet_unknown`, `no_internet`, and `provide_address`.

#### Scenario: Classify TV count
- **WHEN** a customer says "שתי טלויזיות" or "2"
- **THEN** classification returns `provide_tv_count` with entity `tv_count`

#### Scenario: Classify regular internet
- **WHEN** a customer says "רגיל" or "אינטרנט רגיל"
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
- **WHEN** a customer provides a street address after the fiber check prompt
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

## MODIFIED Requirements

### Requirement: Classification drives flow navigation
The call runtime SHALL use the latest classification result to advance **staged flows** (per-stage `advanceOn`, opt-out, and Q&A interrupt rules) or **graph flows** (listen/intent_route edges).

#### Scenario: Staged advance on intent
- **WHEN** the active flow is staged, `currentStageId` is `opening`, and classification returns `ask_offer`
- **THEN** the engine advances to the next stage defined after `opening`

#### Scenario: Staged branch on internet type
- **WHEN** the active flow is staged, `currentStageId` is `ask_internet_type`, and classification returns `internet_regular`
- **THEN** the engine enters sub-flow `fiber_eligibility_check`

#### Scenario: Staged Q&A interrupt without advance
- **WHEN** the active flow is staged on an interruptible stage and classification returns `ask_channel`
- **THEN** the engine answers the question and keeps `currentStageId` unchanged

#### Scenario: Route on intent (graph)
- **WHEN** the active flow is a graph, the active node is `listen`, and classification returns `not_interested`
- **THEN** the engine follows the edge configured for `not_interested`
