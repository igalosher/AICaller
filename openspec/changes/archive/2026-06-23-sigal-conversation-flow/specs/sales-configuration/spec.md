## ADDED Requirements

### Requirement: Internet tier knowledge for AI
The product knowledge base SHALL expose active internet tiers with name, download/upload speeds, and monthly price for AI Q&A.

#### Scenario: List internet tiers
- **WHEN** the AI or a speak node requests internet options during a call
- **THEN** the knowledge layer returns all active internet tiers from configuration and catalog

#### Scenario: Describe internet tier
- **WHEN** a customer asks about a specific speed or tier name
- **THEN** the lookup returns matching tier details in Hebrew

### Requirement: Router rental knowledge for AI
The product knowledge base SHALL include router rental cost information (monthly fee, purchase option if available) sourced from YES catalog or operator configuration.

#### Scenario: Router rental lookup
- **WHEN** a customer asks about router rental price during a call
- **THEN** the knowledge layer returns router rental pricing text suitable for a Hebrew spoken answer

### Requirement: Options comparison for AI
The knowledge layer SHALL provide a summary of available packets, internet tiers, and key differentiators when the customer asks to compare options.

#### Scenario: Compare all options
- **WHEN** the AI invokes compare/options lookup with a general query
- **THEN** the response includes at least active TV packets and internet tiers with prices
