# sales-configuration Specification

## Purpose
TBD - created by archiving change yes-ai-sales-caller. Update Purpose after archive.
## Requirements
### Requirement: Sales packet configuration
Operators SHALL be able to define and manage YES sales packets (bundles combining TV, phone, and internet services) including name, description, monthly price, contract term, and included services.

#### Scenario: Create a new sales packet
- **WHEN** an operator adds a packet with name, price, and service inclusions in Hebrew
- **THEN** the packet is saved and becomes available to the AI caller for recommendations

#### Scenario: Deactivate a packet
- **WHEN** an operator marks a packet as inactive
- **THEN** the AI caller SHALL NOT offer that packet on new calls

### Requirement: Channel and service options
Operators SHALL be able to configure individual channel packages, add-on channels, internet speed tiers, and phone plan options that can be combined into packets or offered as upgrades.

#### Scenario: Configure channel bundle
- **WHEN** an operator defines a channel package with a list of channel names
- **THEN** the package is stored and the AI can describe its channels when asked

#### Scenario: Configure internet tier
- **WHEN** an operator sets an internet speed tier with upload/download speeds and price
- **THEN** the tier is available for packet composition and AI Q&A

### Requirement: Product knowledge base for AI
All configured packets, channels, channel packages, and options SHALL be indexed into a structured knowledge base with **per-channel and per-package query APIs** that the AI caller uses to answer customer questions accurately.

#### Scenario: AI answers packet price question
- **WHEN** a customer asks "כמה עולה החבילה הבסיסית?" during a call
- **THEN** the AI responds with the configured price and key inclusions from the knowledge base

#### Scenario: AI answers specific channel inclusion
- **WHEN** a customer asks if a named channel is included in the current offer
- **THEN** the AI answers yes/no with the channel description from the knowledge base

#### Scenario: Stale data prevented
- **WHEN** an operator updates a packet price or channel list
- **THEN** subsequent calls use the updated data without requiring application restart

### Requirement: Comparison and upsell rules
Operators SHALL be able to define comparison hints and upsell rules (e.g., "if customer has only TV, suggest triple-play") stored as configuration metadata.

#### Scenario: Upsell rule applied
- **WHEN** a customer indicates they only want TV and an upsell rule exists for TV-only prospects
- **THEN** the AI presents the configured upsell suggestion

### Requirement: Configuration validation
The system SHALL validate that each active packet references only existing channels and service options before saving.

#### Scenario: Invalid packet reference
- **WHEN** an operator saves a packet referencing a deleted channel package
- **THEN** the system rejects the save with a descriptive Hebrew validation error

### Requirement: Channel lookup API for AI
The system SHALL expose structured lookup functions (and REST endpoints for the operator UI) to resolve channels by Hebrew name or fuzzy match, return channel descriptions from the YES catalog, and list channels included in a given packet or channel package.

#### Scenario: Lookup single channel
- **WHEN** the AI or operator queries channel "ספורט 5"
- **THEN** the system returns catalog description, category, and list of packets that include it

#### Scenario: List channels in packet
- **WHEN** the AI needs channels for packet "חבילת יסוד - ילדים"
- **THEN** the system returns the ordered channel list and any catalog metadata

#### Scenario: Fuzzy channel match
- **WHEN** a customer says "דוקו" without the full name "yes דוקו"
- **THEN** the lookup returns the best matching catalog channel with confidence score

### Requirement: Channel entity extraction support
The product knowledge layer SHALL accept extracted channel entities from classification and bind them to catalog channel ids for accurate Q&A.

#### Scenario: Entity-bound channel answer
- **WHEN** classification extracts `channel: "Animal Planet"` during a call discussing TV packets
- **THEN** subsequent speak/LLM context uses the resolved catalog entry for that channel

