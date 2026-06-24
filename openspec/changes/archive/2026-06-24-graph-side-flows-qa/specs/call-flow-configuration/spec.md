## ADDED Requirements

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

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Linear-to-graph migration
**Reason**: Flow Builder no longer exposes linear import; operators edit graphs directly.
**Migration**: Legacy linear `stagesJson` may still exist on old flow records; graph publish is the supported configuration path.
