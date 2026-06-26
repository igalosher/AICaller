## ADDED Requirements

### Requirement: Call-time agent feedback as drafts
During agent-mode calls, operator feedback on an AI transcript line SHALL create **pending drafts** only. Drafts SHALL NOT update live agent config or approved examples until explicitly approved on the **סוכן** page.

#### Scenario: Submit corrected response as draft
- **WHEN** an operator submits a corrected AI response from the Calls screen on an agent call
- **THEN** an `AgentInstructionDraft` with `kind` `response_example` and `status` `pending` is created and the live example library is unchanged

#### Scenario: Submit instruction patch as draft
- **WHEN** an operator submits instruction feedback targeting mission, limits, or policies from the Calls screen
- **THEN** a pending `config_patch` draft is created with the target field and proposed text

#### Scenario: Live calls ignore pending drafts
- **WHEN** a new agent-mode call runs while pending drafts exist
- **THEN** the agent runtime uses only the published active config and `approved` examples

### Requirement: Draft approval merges into production
The Agent page SHALL provide approve and discard actions for each pending draft.

#### Scenario: Approve response example draft
- **WHEN** an operator approves a `response_example` draft
- **THEN** an `AgentResponseExample` with `approved: true` is created, the draft status becomes `approved`, and future agent turns may retrieve the example

#### Scenario: Approve config patch draft
- **WHEN** an operator approves a `config_patch` draft
- **THEN** the patch is applied to the active agent config, a new config version is saved with `source` `draft_approval`, and the draft status becomes `approved`

#### Scenario: Discard draft
- **WHEN** an operator discards a pending draft
- **THEN** the draft status becomes `discarded` and it never affects config or examples

### Requirement: Draft provenance
Each draft SHALL record optional `callId`, `segmentId`, and operator note linking feedback to the originating transcript line.

#### Scenario: Draft shows call context
- **WHEN** an operator views a pending draft on the Agent page
- **THEN** the UI shows which call and AI line produced the draft when provenance is available

## MODIFIED Requirements

### Requirement: Learning from operator corrections
Operators SHALL correct AI transcript lines on the Calls screen during agent-mode calls. Corrections and instruction feedback SHALL be stored as **pending drafts** until approved on the **סוכן** page. Approved response corrections SHALL be stored as `AgentResponseExample` records and retrieved for similar future customer utterances in agent mode.

#### Scenario: Save correction from call review
- **WHEN** an operator marks an AI line as wrong and submits a corrected Hebrew response
- **THEN** a pending `response_example` draft is created (not an immediately approved example)

#### Scenario: Example used on similar utterance
- **WHEN** a new agent call receives customer text similar to a stored **approved** example
- **THEN** the agent prompt includes that corrected example as guidance

#### Scenario: Pending draft not used in runtime
- **WHEN** a similar customer utterance matches only a pending (unapproved) draft
- **THEN** the agent prompt does not include that draft content
