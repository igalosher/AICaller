## ADDED Requirements

### Requirement: Global product Q&A interrupt
During any stage marked `interruptible: true`, product-related customer questions SHALL be answered using catalog-backed knowledge and LLM assistance **without advancing the stage**, unless the utterance also matches an explicit `advanceOn` intent for that stage.

#### Scenario: Channel question during opening
- **WHEN** the customer is on stage `opening` and asks "יש לכם ספורט 5?"
- **THEN** the AI answers from catalog context and remains on stage `opening` (listen resumes)

#### Scenario: Internet question mid-stage
- **WHEN** the customer asks about internet speeds during an interruptible stage
- **THEN** the AI answers using internet tier knowledge and the call resumes the same `currentStageId`

### Requirement: Resume after interrupt
After answering an interrupt Q&A, the runtime SHALL return to listen mode for the **same** stage unless the customer utterance matched `advanceOn` or opt-out.

#### Scenario: Resume listen after Q&A
- **WHEN** the AI finishes answering a package question on stage `opening`
- **THEN** the customer may continue speaking and stage advance rules still apply

### Requirement: Interrupt scope
Interrupt Q&A SHALL support questions about packages, channels, internet, promotions/deals, router rental, and price objections, reusing existing product knowledge tools.

#### Scenario: Promotion question
- **WHEN** the customer asks "מה המבצעים" during any interruptible stage
- **THEN** the system answers with available offers/packets summary and does not skip to a later stage

### Requirement: Confusion repeat does not advance
When the customer utterance is classified as `didnt_understand`, the Q&A interrupt and stage advance handlers SHALL NOT run; only the repeat-last-statement handler applies.

#### Scenario: Confusion during product question window
- **WHEN** the customer says "מה?" on stage `ask_tv_count`
- **THEN** the AI repeats the TV-count question and does not treat the utterance as `provide_tv_count`
