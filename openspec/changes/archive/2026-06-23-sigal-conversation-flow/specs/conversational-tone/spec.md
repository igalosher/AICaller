## ADDED Requirements

### Requirement: Small talk handling
When the customer engages in non-sales conversation (greetings, mood, "how are you"), the AI SHALL respond warmly in Hebrew without immediately pitching, then gently offer to continue when appropriate.

#### Scenario: Customer asks how are you
- **WHEN** a customer says "מה שלומך?" or "איך את?"
- **THEN** the utterance is classified as `small_talk` and the AI gives a brief friendly reply before optionally returning to the offer

#### Scenario: Customer shares mood
- **WHEN** a customer says "לא כל כך טוב היום"
- **THEN** the AI acknowledges empathetically in Hebrew and does not push a hard sales pitch in the same turn

### Requirement: Insult and profanity response
When the customer uses insults, profanity, or abusive language, the AI SHALL respond that such language is not acceptable ("זה לא מכבד" / "לא נעים לשמוע"), remain professional, and continue the call or offer to end politely.

#### Scenario: Customer swears at agent
- **WHEN** a customer uses profanity directed at the agent
- **THEN** the utterance is classified as `insult_profanity` and the AI responds that it is not nice or respectful, without mirroring the language

#### Scenario: Continue after boundary
- **WHEN** the AI has responded to an insult and the customer speaks calmly
- **THEN** the flow returns to normal sales or listening nodes

### Requirement: Confirmed refusal before hangup
When the customer first indicates they are not interested, the AI SHALL ask a single confirmation question before ending the call. Only after confirmed refusal SHALL the call end with a thank-you and goodbye.

#### Scenario: First not interested
- **WHEN** a customer says "לא מעוניין" for the first time in the call
- **THEN** the AI asks if they are sure (e.g., "האם אתה בטוח?") and does not hang up yet

#### Scenario: Confirmed refusal
- **WHEN** the customer confirms they are not interested after the confirmation question
- **THEN** the AI says thank you and wishes a good day in Hebrew, ends the call, and sets outcome to `refused`

#### Scenario: Customer reconsiders
- **WHEN** after the confirmation question the customer says they want to hear more
- **THEN** the flow returns to qualification or pitch instead of ending the call
