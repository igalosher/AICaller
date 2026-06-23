## ADDED Requirements

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

## MODIFIED Requirements

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
