## MODIFIED Requirements

### Requirement: Configurable opening line
Operators SHALL configure the call opening via staged flow stage `opening` `speakText` (primary default) or via the visual flow builder's start speak node for graph flows, with template variables including `{{customer_first_name}}`, `{{customer_family_name}}`, `{{customer_full_name}}`, and legacy `{{customer_name}}`. The default opening SHALL introduce Sigal as a YES digital assistant with compliance opt-out language.

#### Scenario: Opening line with customer name
- **WHEN** a call starts for contact "דוד כהן" and stage `opening` uses `{{customer_first_name}}` and `{{customer_family_name}}`
- **THEN** the AI speaks a greeting that includes "דוד כהן" and Sigal's digital-assistant introduction as the first utterance

#### Scenario: Preview opening line
- **WHEN** an operator edits the opening speak node in the flow builder (graph flows)
- **THEN** a live preview shows the rendered text with a sample customer name

### Requirement: Multi-stage call flow
Operators SHALL configure outbound flows as either **staged scripts** (`flowType: "staged"`) with ordered stages and per-stage advance rules, or as directed graphs (visual flow builder) with nodes for speech, listening, decisions, and intent-based branches. Linear stage lists MAY be imported into a graph for backward compatibility.

#### Scenario: Staged flow progresses by stage rules
- **WHEN** the active flow is staged and the customer on stage `opening` triggers an `advanceOn` intent or silence advance
- **THEN** the runtime advances to the next stage in the `stages` array

#### Scenario: Flow progresses through graph nodes
- **WHEN** the active flow is a graph and the AI completes a speak node and the customer response is classified with a matching intent edge
- **THEN** the runtime advances to the target node on that edge

#### Scenario: Reorder flow via graph edit
- **WHEN** an operator reconnects nodes and publishes a graph flow
- **THEN** new calls follow the updated graph topology

### Requirement: Default flow template
The system SHALL ship with a default **staged** YES outbound flow whose stage `opening` contains the Sigal compliance opener and whose subsequent stages define the sales narrative. A legacy Sigal graph MAY remain available for import but SHALL NOT be the default published outbound flow.

#### Scenario: First-time setup
- **WHEN** the application is initialized with no custom published flow
- **THEN** the default staged Sigal flow is active for outbound calls

#### Scenario: Opening stage in default staged flow
- **WHEN** an operator inspects the default published staged flow
- **THEN** stage `opening` includes prior-interest hook, pricing/gift mention, opt-out instruction ("הסר"), and notice that product questions are welcome at every stage

#### Scenario: Placeholder next stage
- **WHEN** an operator inspects the default published staged flow
- **THEN** stages `ask_tv_count` and `ask_internet_type` exist with qualification scripts and sub-flow branch mappings
