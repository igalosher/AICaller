## MODIFIED Requirements

### Requirement: Barge-in interruption
Customers SHALL be able to interrupt the AI while it is speaking. The system MUST stop TTS playback promptly and process the customer's utterance.

#### Scenario: Customer interrupts mid-pitch
- **WHEN** the AI is speaking a packet description and the customer starts talking
- **THEN** AI speech stops within 500 ms and the customer's speech is captured and processed

#### Scenario: Resume after answering interruption
- **WHEN** the AI finishes answering an interrupting product question during a staged interruptible stage
- **THEN** the AI resumes listen mode for the **same** `currentStageId` without advancing the stage

### Requirement: Conversational sales behavior
The AI SHALL conduct outbound sales conversations as **Sigal**, guided by the active **staged flow** or graph flow and classified intent: greet by full name, present the scripted opener with opt-out language, answer product questions via the global Q&A interrupt, advance stages per rules, handle small talk and insults per tone rules where configured, use confirmed refusal on graph flows, and attempt to close or record outcome.

#### Scenario: Opt-out ends call immediately
- **WHEN** the customer utterance is classified as `opt_out_remove`
- **THEN** the AI speaks "תודה רבה ויום נעים", ends the call, and sets contact status to `blacklisted`

#### Scenario: Successful close detection
- **WHEN** the customer utterance is classified as `agree_purchase` with sufficient confidence
- **THEN** the AI follows the close branch or stage, confirms selection, summarizes terms, and marks the call outcome as `sold`

#### Scenario: Refusal detection (graph flows)
- **WHEN** the customer utterance is classified as `not_interested` on first indication on a graph flow
- **THEN** the AI follows the confirmation branch rather than immediately hanging up

#### Scenario: Confirmed refusal ends call
- **WHEN** the customer utterance is classified as `not_interested_confirmed` after confirmation
- **THEN** the AI thanks the customer, wishes a good day, ends the call, and sets contact status to `refused`

### Requirement: Intent-driven flow navigation
After each classified customer utterance, the voice pipeline SHALL advance the call according to the active engine: **staged** (`currentStageId`, `advanceOn`, opt-out, Q&A interrupt) or **graph** (edges matching intent), then generate the next speak content.

#### Scenario: Staged advance after offer question
- **WHEN** classification returns `ask_offer` on stage `opening` of a staged flow
- **THEN** the engine advances to the next stage and speaks that stage's script

#### Scenario: Branch on channel question (graph)
- **WHEN** classification returns `ask_channel` with entity channel name on a graph flow
- **THEN** the engine moves to the channel Q&A branch node and the LLM receives channel context from the catalog

#### Scenario: Q&A interrupt on staged flow
- **WHEN** classification returns `ask_packet` on an interruptible staged stage that does not list `ask_packet` in `advanceOn`
- **THEN** the engine generates a catalog-backed answer and remains on the same stage
