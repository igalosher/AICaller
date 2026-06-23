# hebrew-voice-ai Specification

## Purpose
TBD - created by archiving change yes-ai-sales-caller. Update Purpose after archive.
## Requirements
### Requirement: Hebrew speech output
The AI caller SHALL speak Hebrew using natural-sounding text-to-speech suitable for telephony (8 kHz or higher, clear pronunciation of Israeli Hebrew).

#### Scenario: AI delivers pitch in Hebrew
- **WHEN** the AI presents a sales packet during a call
- **THEN** the customer hears fluent Hebrew audio over the phone line

### Requirement: Hebrew speech recognition
The system SHALL transcribe customer speech in Hebrew in real time and pass each final segment to intent classification before flow navigation and response generation.

#### Scenario: Customer asks a question in Hebrew
- **WHEN** a customer asks "מה כלול בחבילה?" during the call
- **THEN** the system transcribes the utterance, classifies intent (e.g., `ask_packet`), and routes to the flow node within 2 seconds

### Requirement: Barge-in interruption
Customers SHALL be able to interrupt the AI while it is speaking. The system MUST stop TTS playback promptly and process the customer's utterance.

#### Scenario: Customer interrupts mid-pitch
- **WHEN** the AI is speaking a packet description and the customer starts talking
- **THEN** AI speech stops within 500 ms and the customer's speech is captured and processed

#### Scenario: Resume after answering interruption
- **WHEN** the AI finishes answering an interrupting question
- **THEN** the AI resumes the call flow from an appropriate point (not repeating the entire previous segment unless configured)

### Requirement: Contextual product Q&A
The AI SHALL answer customer questions about configured packets, **specific channels by name**, channel package membership, prices, contract terms, and service options using the sales configuration and YES catalog knowledge base.

#### Scenario: Channel list question
- **WHEN** a customer asks which sports channels are included in a specific packet
- **THEN** the AI lists the configured channels accurately in Hebrew

#### Scenario: Specific channel question
- **WHEN** a customer asks "האם יש לכם את ערוץ ספורט 5?" or "מה זה ערוץ yes דוקו?"
- **THEN** the AI answers using the channel's catalog description and whether it is included in the discussed or default packet

#### Scenario: Channel package question
- **WHEN** a customer asks about a channel bundle or add-on package by name
- **THEN** the AI describes the package channels and price from configuration

#### Scenario: Unknown question fallback
- **WHEN** a customer asks something not covered by configuration
- **THEN** the AI acknowledges uncertainty in Hebrew and follows the flow's default or clarify branch (or offers callback per node configuration)

### Requirement: Conversational sales behavior
The AI SHALL conduct outbound sales conversations guided by the **active flow graph node** and classified intent: greet by name, present offers, handle objections via intent branches, and attempt to close or record outcome.

#### Scenario: Successful close detection
- **WHEN** the customer utterance is classified as `agree_purchase` with sufficient confidence
- **THEN** the AI follows the close branch, confirms selection, summarizes terms, and marks the call outcome as `sold`

#### Scenario: Refusal detection
- **WHEN** the customer utterance is classified as `not_interested` or `do_not_call`
- **THEN** the AI follows the refusal branch, politely ends the call, and the contact status is set to `refused`

### Requirement: Call transcript and summary
The system SHALL generate a Hebrew transcript with **per-utterance intent labels** and a structured call summary (outcome, packets discussed, objections raised, channels mentioned) after each call.

#### Scenario: Post-call summary available
- **WHEN** a call ends
- **THEN** a transcript with intent annotations and summary are stored and linked to the contact's call history within 30 seconds

### Requirement: Low-latency real-time pipeline
End-to-end voice round-trip (customer speech end → AI response audio start) SHALL target under 2 seconds under normal network conditions.

#### Scenario: Acceptable response latency
- **WHEN** a customer finishes a short question
- **THEN** the AI begins speaking its response within 2 seconds in 90% of utterances during testing

### Requirement: Intent-driven flow navigation
After each classified customer utterance, the voice pipeline SHALL advance the call's active graph node according to flow edges matching the intent (or default edge), then generate the next speak content from that node.

#### Scenario: Branch on channel question
- **WHEN** classification returns `ask_channel` with entity channel name
- **THEN** the engine moves to the channel Q&A branch node and the LLM receives channel context from the catalog

