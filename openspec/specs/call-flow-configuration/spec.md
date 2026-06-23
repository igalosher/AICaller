# call-flow-configuration Specification

## Purpose
TBD - created by archiving change yes-ai-sales-caller. Update Purpose after archive.
## Requirements
### Requirement: Configurable opening line
Operators SHALL configure the call opening via the visual flow builder's start speak node (or dedicated opening node), with template variables including `{{customer_full_name}}`, `{{customer_first_name}}`, and legacy `{{customer_name}}` (alias for full name). The default opening SHALL introduce the agent as **Sigal** from YES.

#### Scenario: Opening line with customer name
- **WHEN** a call starts for contact "דוד כהן" and the opening speak node template is "שלום {{customer_first_name}}, מדברת סיגל מ-YES"
- **THEN** the AI speaks "שלום דוד, מדברת סיגל מ-YES" as the first utterance

#### Scenario: Preview opening line
- **WHEN** an operator edits the opening speak node in the flow builder
- **THEN** a live preview shows the rendered text with a sample customer name

### Requirement: Multi-stage call flow
Operators SHALL configure call flows as directed graphs (visual flow builder) with nodes for speech, listening, decisions, and intent-based branches. Linear stage lists MAY be imported into a graph for backward compatibility.

#### Scenario: Flow progresses through graph nodes
- **WHEN** the AI completes a speak node and the customer response is classified with a matching intent edge
- **THEN** the runtime advances to the target node on that edge

#### Scenario: Reorder flow via graph edit
- **WHEN** an operator reconnects nodes and publishes the graph
- **THEN** new calls follow the updated graph topology

### Requirement: Objection handling scripts
Objection handling SHALL be modeled as intent-route branches (e.g., `price_objection`, `not_interested`, `callback`) with dedicated speak or behavior nodes per branch, configurable in the flow builder.

#### Scenario: Price objection handled
- **WHEN** a customer utterance is classified as `price_objection` and the active flow has a branch for that intent
- **THEN** the AI follows the price-objection branch node content before continuing the flow

### Requirement: Flow versioning
The system SHALL store published flow graph versions so in-progress calls use the version active at call start.

#### Scenario: Flow update during active call
- **WHEN** an operator publishes graph changes while a call is in progress
- **THEN** the active call continues on the previous graph version; new calls use the published version

### Requirement: Default flow template
The system SHALL ship with a default YES starter graph flow that includes: Sigal opening → optional small-talk branch → qualification → pitch → product Q&A branches → **confirmed refusal** → close.

#### Scenario: First-time setup
- **WHEN** the application is initialized with no custom published graph
- **THEN** the default Sigal conversation flow is active for outbound calls

#### Scenario: Small talk branch in default flow
- **WHEN** an operator inspects the default published graph
- **THEN** an intent-route branch for `small_talk` exists with a dedicated speak node

#### Scenario: Confirm refusal in default flow
- **WHEN** an operator inspects the default published graph
- **THEN** `not_interested` routes to a confirmation speak node before any end-refused node

### Requirement: Linear-to-graph migration
The system SHALL provide migration from legacy linear stage JSON to an equivalent graph representation without losing stage scripts or objection mappings.

#### Scenario: Import legacy linear flow
- **WHEN** an operator opens the flow builder on a tenant with only linear stages configured
- **THEN** a one-click import generates a draft graph from the linear configuration

