## ADDED Requirements

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

## MODIFIED Requirements

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
