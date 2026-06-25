## ADDED Requirements

### Requirement: Flow edit API for natural language
The system SHALL expose an authenticated endpoint that accepts a Hebrew natural-language instruction and the current draft flow graph, produces a structured graph patch limited to flow-editing operations, validates the result, and returns the updated draft with a Hebrew summary of changes.

#### Scenario: Add a speak stage after provider question
- **WHEN** an operator sends "הוסיפי שאלה על המחיר הנוכחי אחרי שאלת הספק" with the active draft graph
- **THEN** the server returns a validated draft graph with a new speak/listen/route stage wired after the provider checkpoint and lists affected node ids

#### Scenario: Change speak wording
- **WHEN** an operator sends "שני את ניסוח שאלת הטלוויזיות להיות יותר קצר"
- **THEN** the server updates the relevant speak node text in the draft and returns `affectedNodeIds` including that speak node

#### Scenario: Invalid patch rejected
- **WHEN** the LLM proposes a patch that breaks flow validation (e.g. decision node without default edge)
- **THEN** the server does not persist the patch and returns Hebrew validation errors to the client

### Requirement: Scope limited to flow editing
The flow AI assistant SHALL only fulfill requests related to the conversation flow graph: nodes, edges, speak text, variables, lookup tables, listen bindings, side flows, and routing conditions. Requests about contacts, calls, settings, billing, or general chit-chat SHALL be refused.

#### Scenario: Off-topic request refused
- **WHEN** an operator asks "מה מזג האוויר בתל אביב?"
- **THEN** the API responds with a Hebrew refusal explaining the assistant only edits the call flow

#### Scenario: In-scope rewire accepted
- **WHEN** an operator asks "חברי את תשובת 'לא מעוניין' לפרידה מנומסת"
- **THEN** the assistant returns a patch that updates intent_route or decision edges accordingly

### Requirement: Patch operation bounds
AI-generated patches SHALL use a fixed set of operations (add/update/delete nodes and edges, update speak text, manage variables and bindings) and SHALL NOT execute arbitrary code, SQL, or settings changes.

#### Scenario: No settings mutation
- **WHEN** an operator asks "שנה את מפתח OpenAI בהגדרות"
- **THEN** the request is refused as out of scope

### Requirement: Hebrew operator summaries
Each successful AI edit SHALL include a short Hebrew summary describing what changed (nodes added, text updated, edges rewired).

#### Scenario: Summary after edit
- **WHEN** a patch adds two nodes and one edge
- **THEN** the response `summaryHe` mentions the added stage in Hebrew
