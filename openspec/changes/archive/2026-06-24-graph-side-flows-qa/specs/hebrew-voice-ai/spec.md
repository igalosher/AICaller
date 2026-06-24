## MODIFIED Requirements

### Requirement: Contextual product Q&A
The AI SHALL answer customer questions about configured packets, **specific channels by name** (including per-channel descriptions and details), channel package membership, prices, contract terms, **internet speed tiers and options**, **router rental costs**, and **comparisons between available options** using the sales configuration and YES catalog knowledge base. Mid-call Q&A and `useLlm` speak nodes SHALL NOT re-deliver the full opening self-introduction.

#### Scenario: Channel list question
- **WHEN** a customer asks which sports channels are included in a specific packet
- **THEN** the AI lists the configured channels accurately in Hebrew

#### Scenario: Specific channel question
- **WHEN** a customer asks "האם יש לכם את ערוץ ספורט 5?" or "מה זה ערוץ yes דוקו?"
- **THEN** the AI answers using the channel's catalog description and whether it is included in the discussed or default packet

#### Scenario: Mid-call reply without re-introduction
- **WHEN** the AI answers a product question during a graph listen checkpoint after the opening
- **THEN** the reply does not repeat "כאן סיגל מחברת YES, אני עוזרת דיגיטלית" unless the node is the opening speak

#### Scenario: Qualification answer uses scripted speak
- **WHEN** the customer gives a scoped qualification answer and the next speak node has `useLlm: false`
- **THEN** the AI speaks the node's template text without LLM paraphrase
