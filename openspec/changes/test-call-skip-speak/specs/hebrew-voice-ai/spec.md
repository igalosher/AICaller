## MODIFIED Requirements

### Requirement: Barge-in interruption
Customers SHALL be able to interrupt the AI while it is speaking. The system MUST stop TTS playback promptly and process the customer's utterance. **Operator skip-speak in browser test calls is not a barge-in** — it stops audio without processing customer speech.

#### Scenario: Customer interrupts mid-pitch
- **WHEN** the AI is speaking a packet description and the customer starts talking
- **THEN** AI speech stops within 500 ms and the customer's speech is captured and processed

#### Scenario: Resume after answering interruption
- **WHEN** the AI finishes answering an interrupting product question during a staged interruptible stage
- **THEN** the AI resumes listen mode for the **same** `currentStageId` without advancing the stage

#### Scenario: Test call skip is not barge-in
- **WHEN** an operator uses skip-speak during browser test call playback
- **THEN** playback stops but no customer utterance is classified and interrupt routing does not run
