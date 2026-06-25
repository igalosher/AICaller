# hebrew-voice-ai Specification

## Purpose
TBD - created by archiving change yes-ai-sales-caller. Update Purpose after archive.
## Requirements
### Requirement: Hebrew speech output
The AI caller SHALL speak Hebrew using natural-sounding text-to-speech suitable for telephony (8 kHz or higher, clear pronunciation of Israeli Hebrew). Synthesis SHALL respect the **addressee's gender** (`contact.sex`) for homographic second-person forms (same spelling, different pronunciation).

#### Scenario: AI delivers pitch in Hebrew
- **WHEN** the AI presents a sales packet during a call
- **THEN** the customer hears fluent Hebrew audio over the phone line

#### Scenario: Gender-appropriate homograph pronunciation
- **WHEN** the scripted prompt includes "לך" and the contact is female
- **THEN** the customer hears female second-person pronunciation (*lach*), not male (*lecha*)

### Requirement: Operator-authored niqqud in speak templates
Speak node templates MAY include Hebrew niqqud (vocalization marks) for correct pronunciation of names and fixed phrases. The TTS pipeline SHALL pass operator-authored niqqud through to synthesis unless a separate homograph adapter overrides a specific token.

#### Scenario: Niqqud in opening reaches TTS
- **WHEN** `speak_opening` contains niqqud on the agent name (e.g. סִגׇּל)
- **THEN** the string sent to ElevenLabs retains those marks for pronunciation

#### Scenario: Transcript retains operator spelling
- **WHEN** the AI speaks a line with operator-authored niqqud
- **THEN** the stored transcript matches the speak node template text as configured in the flow

### Requirement: Hebrew speech recognition
The system SHALL transcribe customer speech in Hebrew in real time and pass each final segment to intent classification before flow navigation and response generation.

#### Scenario: Customer asks a question in Hebrew
- **WHEN** a customer asks "מה כלול בחבילה?" during the call
- **THEN** the system transcribes the utterance, classifies intent (e.g., `ask_packet`), and routes to the flow node within 2 seconds

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

### Requirement: Contextual product Q&A
The AI SHALL answer customer questions about configured packets, **specific channels by name** (including per-channel descriptions and details), channel package membership, prices, contract terms, **internet speed tiers and options**, **router rental costs**, and **comparisons between available options** using the sales configuration and YES catalog knowledge base. Mid-call Q&A and `useLlm` speak nodes SHALL NOT re-deliver the full opening self-introduction.

#### Scenario: Channel list question
- **WHEN** a customer asks which sports channels are included in a specific packet
- **THEN** the AI lists the configured channels accurately in Hebrew

#### Scenario: Specific channel question
- **WHEN** a customer asks "האם יש לכם את ערוץ ספורט 5?" or "מה זה ערוץ yes דוקו?"
- **THEN** the AI answers using the channel's catalog description and whether it is included in the discussed or default packet

#### Scenario: Mid-call reply without re-introduction
- **WHEN** the AI answers a product question during a graph listen checkpoint after the opening
- **THEN** the reply does not repeat "כאן סיגל מחברת YES, אני עוזרת דיגיטלית" unless the node is the opening speak

#### Scenario: Qualification answer uses scripted speak
- **WHEN** the customer gives a scoped qualification answer and the next speak node has `useLlm: false`
- **THEN** the AI speaks the node's template text without LLM paraphrase

#### Scenario: Channel package question
- **WHEN** a customer asks about a channel bundle or add-on package by name
- **THEN** the AI describes the package channels and price from configuration

#### Scenario: Internet options question
- **WHEN** a customer asks what internet speeds or plans are available
- **THEN** the AI lists configured internet tiers with speeds and monthly prices from the knowledge base

#### Scenario: Router rental question
- **WHEN** a customer asks how much router rental costs
- **THEN** the AI answers with configured or catalog-backed router rental pricing in Hebrew

#### Scenario: Compare options question
- **WHEN** a customer asks for different options or what else is available
- **THEN** the AI summarizes relevant packets, tiers, or add-ons from the knowledge base

#### Scenario: Unknown question fallback
- **WHEN** a customer asks something not covered by configuration
- **THEN** the AI acknowledges uncertainty in Hebrew and follows the flow's default or clarify branch (or offers callback per node configuration)

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

