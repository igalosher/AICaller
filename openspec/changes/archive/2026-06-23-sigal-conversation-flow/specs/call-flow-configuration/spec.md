## MODIFIED Requirements

### Requirement: Configurable opening line
Operators SHALL configure the call opening via the visual flow builder's start speak node (or dedicated opening node), with template variables including `{{customer_full_name}}`, `{{customer_first_name}}`, and legacy `{{customer_name}}` (alias for full name). The default opening SHALL introduce the agent as **Sigal** from YES.

#### Scenario: Opening line with customer name
- **WHEN** a call starts for contact "דוד כהן" and the opening speak node template is "שלום {{customer_first_name}}, מדברת סיגל מ-YES"
- **THEN** the AI speaks "שלום דוד, מדברת סיגל מ-YES" as the first utterance

#### Scenario: Preview opening line
- **WHEN** an operator edits the opening speak node in the flow builder
- **THEN** a live preview shows the rendered text with a sample customer name

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
