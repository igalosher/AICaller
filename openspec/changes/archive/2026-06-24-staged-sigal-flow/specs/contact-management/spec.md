## MODIFIED Requirements

### Requirement: Sale status tracking
Each contact SHALL have one of the following sale statuses: `pending`, `in_call`, `sold`, `callback`, `refused`, and `blacklisted`.

#### Scenario: Mark contact as sold
- **WHEN** an operator or the AI flow marks a contact as sold after a successful sale
- **THEN** the contact status updates to `sold` and the sale timestamp is recorded

#### Scenario: Mark contact as refused
- **WHEN** a customer refuses the offer through the normal refusal flow (not legal opt-out)
- **THEN** the contact status updates to `refused` and the contact SHALL NOT be included in bulk or automatic call queues

#### Scenario: Mark contact as blacklisted on opt-out
- **WHEN** a customer says "הסר" during a call and the opt-out handler runs
- **THEN** the contact status updates to `blacklisted` and the contact SHALL NOT be included in bulk or automatic call queues

#### Scenario: Mark contact as callback on lead close
- **WHEN** the customer agrees to a representative callback on `ask_callback`
- **THEN** the contact status updates to `callback` for human follow-up on installation

#### Scenario: Refused and blacklisted contacts excluded from calling
- **WHEN** an operator initiates a bulk call or "call next" action
- **THEN** contacts with status `refused` or `blacklisted` are skipped
