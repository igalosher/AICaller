# autonomous-sales-agent Specification

## Purpose
Autonomous Sigal sales agent mode: mission-driven Hebrew conversations grounded in the YES product catalog, bounded by operator-defined limits, switchable alongside flow mode, and improvable via reviewed response corrections.

## Requirements

### Requirement: Conversation mode selection
Operators SHALL switch between **Flow Mode** and **Agent Mode** from the application header adjacent to the YES AI Caller logo. The selected mode SHALL persist in application settings and apply to **new** outbound and browser test calls.

#### Scenario: Switch to Agent Mode
- **WHEN** an operator selects Agent Mode in the header
- **THEN** the setting is saved and subsequent calls use the agent runtime

#### Scenario: Switch to Flow Mode
- **WHEN** an operator selects Flow Mode
- **THEN** subsequent calls use the published flow graph/staged runtime as today

#### Scenario: Call records mode used
- **WHEN** a call is created
- **THEN** `conversationMode` on the call is set to the current global mode (`flow` or `agent`)

### Requirement: Agent configuration
Operators SHALL configure the sales agent on a dedicated **Agent** screen with: **mission** (purpose), **hard limits**, **policies** (soft skills), and an **opening template** with opt-out language.

#### Scenario: Save agent mission
- **WHEN** an operator edits the mission text and saves
- **THEN** agent-mode calls use the updated mission in the LLM system context

#### Scenario: Hard limits enforced in prompt
- **WHEN** limits include catalog-only pricing and opt-out on "הסר"
- **THEN** the agent runtime includes those limits in every turn's system prompt

### Requirement: Agent voice runtime
When `conversationMode` is `agent`, connected calls SHALL process customer speech through the agent runtime instead of the flow graph. The agent SHALL use existing product catalog tools, maintain per-call memory in `contextJson.agent`, and produce Hebrew replies via TTS using the same telephony pipeline as flow mode.

#### Scenario: Agent opening on connect
- **WHEN** an agent-mode call connects
- **THEN** Sigal speaks the configured opening template (with customer name and opt-out) before listening, without an extra LLM paraphrase on the opening turn

#### Scenario: Agent product question
- **WHEN** the customer asks about a channel or packet during an agent call
- **THEN** the reply uses catalog-backed facts only

#### Scenario: Rejection handling
- **WHEN** the customer clearly refuses twice
- **THEN** the agent ends politely per policy without continuing the pitch

### Requirement: Learning from operator corrections
Operators SHALL correct AI transcript lines on the Calls screen. Corrections SHALL be stored as **approved examples** and retrieved for similar future customer utterances in agent mode.

#### Scenario: Save correction from call review
- **WHEN** an operator marks an AI line as wrong and submits a corrected Hebrew response
- **THEN** an approved `AgentResponseExample` is created

#### Scenario: Example used on similar utterance
- **WHEN** a new agent call receives customer text similar to a stored example
- **THEN** the agent prompt includes that corrected example as guidance

### Requirement: Call management unchanged
Agent mode SHALL NOT change contact list, dial, hang up, live transcript, or status badges beyond displaying which mode the call uses.

#### Scenario: Same calls UI
- **WHEN** an operator monitors an agent-mode call
- **THEN** duration, transcript, and hang up behave as in flow mode
