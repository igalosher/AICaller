# call-flow-configuration Specification

## Purpose
TBD - created by archiving change yes-ai-sales-caller. Update Purpose after archive.
## Requirements
### Requirement: Configurable opening line
Operators SHALL configure the call opening via the visual flow builder's start speak node (or dedicated opening node), with template variables including `{{customer_full_name}}`, `{{customer_first_name}}`, legacy `{{customer_name}}` (alias for full name), and flow session variables. The default opening SHALL introduce the agent as **Sigal** from YES.

#### Scenario: Opening line with customer name
- **WHEN** a call starts for contact "דוד כהן" and the opening speak node template is "שלום {{customer_first_name}}, מדברת סיגל מ-YES"
- **THEN** the AI speaks "שלום דוד, מדברת סיגל מ-YES" as the first utterance

#### Scenario: Preview opening line
- **WHEN** an operator edits the opening speak node in the flow builder
- **THEN** a live preview shows the rendered text with a sample customer name and sample flow variable values

### Requirement: Multi-stage call flow
Operators SHALL configure call flows as directed graphs (visual flow builder) with nodes for speech, listening, decisions, intent-based branches, variable/lookup-based decision branches, and configurable side flows. Linear stage lists remain supported at runtime for legacy staged flows but SHALL NOT be imported from the Flow Builder UI.

#### Scenario: Flow progresses through graph nodes
- **WHEN** the AI completes a speak node and the customer response is classified with a matching intent edge
- **THEN** the runtime advances to the target node on that edge

#### Scenario: Flow progresses via variable decision
- **WHEN** the AI completes a listen node that sets `NumOfTVs` and the next decision node branches on `NumOfTVs >= 2`
- **THEN** the runtime advances to the branch matching the variable value

#### Scenario: Reorder flow via graph edit
- **WHEN** an operator reconnects nodes and publishes the graph
- **THEN** new calls follow the updated graph topology

### Requirement: Side flow runtime on graph calls
The graph call runtime SHALL support entering configured side flows at listen checkpoints, persisting `mainCheckpoint` in call `contextJson`, and restoring the checkpoint when `returnsToMain` completes.

#### Scenario: Checkpoint saved on side flow entry
- **WHEN** a side flow starts from `listen_inet`
- **THEN** `contextJson.mainCheckpoint` stores `listen_inet`, resume node, and the last spoken stage question

### Requirement: Speak node LLM gating
After main-route classification, speak nodes SHALL render `resolveTemplate(node.text)` unless `node.useLlm` is true. Customer utterance text SHALL NOT alone trigger LLM generation on speak nodes.

#### Scenario: Static address prompt after internet answer
- **WHEN** the customer answers `internet_regular` and the next node is `speak_address` with `useLlm: false`
- **THEN** the AI speaks the configured address prompt verbatim without interpreting the answer as a product question

#### Scenario: LLM speak node with context
- **WHEN** a speak node has `useLlm: true` and the runtime passes customer context
- **THEN** `generateSalesReply` may paraphrase while preserving the stage prompt

### Requirement: Graph enhance on save and publish
Draft save and publish SHALL run graph enhancement (variable bindings, default side flows, variable auto-ensure) before persisting and validating.

#### Scenario: Save draft adds missing CustomerAddress variable
- **WHEN** an operator saves a draft with `listen_address` binding but only `NumOfTVs` in variables
- **THEN** the saved draft includes `CustomerAddress` in `variables` automatically

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

### Requirement: Variable-based decision routing
The graph flow runtime SHALL evaluate decision node edge conditions against session variables and lookup tables after listen bindings are applied, selecting the first matching non-default edge or the default edge.

#### Scenario: Route on variable comparison
- **WHEN** the active node is `decision`, session variable `NumOfTVs` is `1`, and edge A has condition `var_eq NumOfTVs 1`
- **THEN** the engine advances to edge A's target node

#### Scenario: Route on lookup exists
- **WHEN** the active node is `decision`, variable `RequestedChannel` is "ספורט 5", and edge A has `lookup_exists` on table `Channels` column `name`
- **THEN** the engine follows edge A if a matching row exists, otherwise the default edge

### Requirement: Apply listen bindings after classification
After classification on a listen node, the runtime SHALL apply configured variable bindings before advancing to intent_route or decision nodes.

#### Scenario: Bind then route
- **WHEN** listen node bindings set `NumOfTVs` from classification and the next node is a decision on `NumOfTVs`
- **THEN** the binding is applied in the same turn before decision evaluation

