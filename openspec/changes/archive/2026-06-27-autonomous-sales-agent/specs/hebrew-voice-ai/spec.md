### Requirement: Agent-mode voice turns
When a call's `conversationMode` is `agent`, the voice pipeline SHALL use the autonomous agent runtime for opening and customer turns instead of graph/staged flow navigation. Flow-mode barge-in and catalog-grounded Q&A behavior SHALL still apply.

#### Scenario: Agent call uses agent runtime
- **WHEN** a connected call has `conversationMode` `agent`
- **THEN** customer utterances are handled by `processAgentTurn` rather than `processGraphTurn` or staged handlers
