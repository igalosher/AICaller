## MODIFIED Requirements

### Requirement: Contextual product Q&A
The AI SHALL answer customer questions about configured packets, **specific channels by name** (including per-channel descriptions and details), channel package membership, prices, contract terms, **internet speed tiers and options**, **router rental costs**, and **comparisons between available options** using the sales configuration and YES catalog knowledge base.

#### Scenario: Channel list question
- **WHEN** a customer asks which sports channels are included in a specific packet
- **THEN** the AI lists the configured channels accurately in Hebrew

#### Scenario: Specific channel question
- **WHEN** a customer asks "האם יש לכם את ערוץ ספורט 5?" or "מה זה ערוץ yes דוקו?"
- **THEN** the AI answers using the channel's catalog description and whether it is included in the discussed or default packet

#### Scenario: Channel package question
- **WHEN** a customer asks about a channel bundle or add-on package by name
- **THEN** the AI describes the package channels and price from configuration

#### Scenario: Internet options question
- **WHEN** a customer asks what internet speeds or plans are available
- **THEN** the AI lists configured internet tiers with speeds and monthly prices from the knowledge base

#### Scenario: Router rental question
- **WHEN** a customer asks how much router rental costs
- **THEN** the AI answers with configured or catalog-backed router rental pricing in Hebrew

#### Scenario: Compare options question
- **WHEN** a customer asks for different options or what else is available
- **THEN** the AI summarizes relevant packets, tiers, or add-ons from the knowledge base

#### Scenario: Unknown question fallback
- **WHEN** a customer asks something not covered by configuration
- **THEN** the AI acknowledges uncertainty in Hebrew and follows the flow's default or clarify branch (or offers callback per node configuration)

### Requirement: Conversational sales behavior
The AI SHALL conduct outbound sales conversations as **Sigal**, guided by the active flow graph node and classified intent: greet by name, handle small talk and insults per tone rules, present offers, handle objections via intent branches, use **confirmed refusal** before ending on not-interested, and attempt to close or record outcome.

#### Scenario: Successful close detection
- **WHEN** the customer utterance is classified as `agree_purchase` with sufficient confidence
- **THEN** the AI follows the close branch, confirms selection, summarizes terms, and marks the call outcome as `sold`

#### Scenario: Refusal detection
- **WHEN** the customer utterance is classified as `not_interested` on first indication
- **THEN** the AI follows the confirmation branch rather than immediately hanging up

#### Scenario: Confirmed refusal ends call
- **WHEN** the customer utterance is classified as `not_interested_confirmed` after confirmation
- **THEN** the AI thanks the customer, wishes a good day, ends the call, and sets contact status to `refused`
