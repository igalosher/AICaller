## ADDED Requirements

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
