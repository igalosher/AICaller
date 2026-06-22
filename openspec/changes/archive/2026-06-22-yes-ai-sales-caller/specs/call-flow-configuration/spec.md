## ADDED Requirements

### Requirement: Configurable opening line
Operators SHALL be able to configure the call opening script with support for template variables, including at minimum `{{customer_name}}` for personalized greeting.

#### Scenario: Opening line with customer name
- **WHEN** a call starts for contact "דוד כהן" and the opening template is "שלום {{customer_name}}, מדברת נציגת YES"
- **THEN** the AI speaks "שלום דוד כהן, מדברת נציגת YES" as the first utterance

#### Scenario: Preview opening line
- **WHEN** an operator edits the opening template in configuration
- **THEN** a live preview shows the rendered text with a sample customer name

### Requirement: Multi-stage call flow
Operators SHALL be able to configure an ordered call flow with named stages (e.g., greeting, qualification, pitch, objection handling, closing) each with an associated script prompt or behavior directive.

#### Scenario: Flow progresses through stages
- **WHEN** the AI completes the greeting stage and the customer does not interrupt with a blocking question
- **THEN** the AI advances to the next configured stage

#### Scenario: Reorder flow stages
- **WHEN** an operator drags stages into a new order and saves
- **THEN** new calls follow the updated stage order

### Requirement: Objection handling scripts
Operators SHALL be able to configure responses or behavior hints for common objections (price, existing provider, not interested, call back later).

#### Scenario: Price objection handled
- **WHEN** a customer says the price is too high and a price-objection script is configured
- **THEN** the AI uses the configured response strategy before continuing the flow

### Requirement: Flow versioning
The system SHALL store flow configuration versions so that in-progress calls use the flow version active at call start.

#### Scenario: Flow update during active call
- **WHEN** an operator saves flow changes while a call is in progress
- **THEN** the active call continues on the previous flow version; new calls use the updated version

### Requirement: Default flow template
The system SHALL ship with a sensible default Hebrew call flow for YES sales that operators can customize.

#### Scenario: First-time setup
- **WHEN** the application is initialized with no custom flow
- **THEN** the default YES sales flow is used for outbound calls
