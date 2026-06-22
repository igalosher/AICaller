## ADDED Requirements

### Requirement: Hebrew speech output
The AI caller SHALL speak Hebrew using natural-sounding text-to-speech suitable for telephony (8 kHz or higher, clear pronunciation of Israeli Hebrew).

#### Scenario: AI delivers pitch in Hebrew
- **WHEN** the AI presents a sales packet during a call
- **THEN** the customer hears fluent Hebrew audio over the phone line

### Requirement: Hebrew speech recognition
The system SHALL transcribe customer speech in Hebrew in real time with sufficient accuracy for sales conversation intents (questions, objections, yes/no, numbers).

#### Scenario: Customer asks a question in Hebrew
- **WHEN** a customer asks "מה כלול בחבילה?" during the call
- **THEN** the system transcribes the utterance and routes it to the conversational AI within 2 seconds

### Requirement: Barge-in interruption
Customers SHALL be able to interrupt the AI while it is speaking. The system MUST stop TTS playback promptly and process the customer's utterance.

#### Scenario: Customer interrupts mid-pitch
- **WHEN** the AI is speaking a packet description and the customer starts talking
- **THEN** AI speech stops within 500 ms and the customer's speech is captured and processed

#### Scenario: Resume after answering interruption
- **WHEN** the AI finishes answering an interrupting question
- **THEN** the AI resumes the call flow from an appropriate point (not repeating the entire previous segment unless configured)

### Requirement: Contextual product Q&A
The AI SHALL answer customer questions about any configured packet, channel, price, contract term, or service option using the sales configuration knowledge base.

#### Scenario: Channel list question
- **WHEN** a customer asks which sports channels are included in a specific packet
- **THEN** the AI lists the configured channels accurately in Hebrew

#### Scenario: Unknown question fallback
- **WHEN** a customer asks something not covered by configuration
- **THEN** the AI acknowledges uncertainty in Hebrew and offers to connect to a human agent or schedule a callback (per flow configuration)

### Requirement: Conversational sales behavior
The AI SHALL conduct outbound sales conversations: greet by name, present offers, handle objections per configured flow, and attempt to close or record outcome.

#### Scenario: Successful close detection
- **WHEN** the customer verbally agrees to purchase a configured packet
- **THEN** the AI confirms the selection, summarizes terms, and marks the call outcome as `sold`

#### Scenario: Refusal detection
- **WHEN** the customer explicitly refuses or asks not to be called again
- **THEN** the AI politely ends the call and the contact status is set to `refused`

### Requirement: Call transcript and summary
The system SHALL generate a Hebrew transcript and a structured call summary (outcome, packets discussed, objections raised) after each call.

#### Scenario: Post-call summary available
- **WHEN** a call ends
- **THEN** a transcript and summary are stored and linked to the contact's call history within 30 seconds

### Requirement: Low-latency real-time pipeline
End-to-end voice round-trip (customer speech end → AI response audio start) SHALL target under 2 seconds under normal network conditions.

#### Scenario: Acceptable response latency
- **WHEN** a customer finishes a short question
- **THEN** the AI begins speaking its response within 2 seconds in 90% of utterances during testing
