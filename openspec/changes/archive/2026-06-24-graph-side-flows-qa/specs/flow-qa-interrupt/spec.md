## ADDED Requirements

### Requirement: Graph-flow Q&A interrupt
When `interruptQa` is enabled on a graph flow (default true), off-script product questions during a listen checkpoint SHALL be answered via catalog-backed LLM without advancing the main route, unless the utterance is a main-path answer or matches a configured side flow.

#### Scenario: Package question during internet listen
- **WHEN** the customer is on `listen_inet` and asks "מה כלול בחבילה?"
- **THEN** the AI answers from product knowledge and repeats the internet-type question without advancing to address

#### Scenario: Qualification answer does not trigger Q&A
- **WHEN** the customer is on `listen_inet` and says "רגיל"
- **THEN** classification is `internet_regular`, Q&A interrupt does not run, and the flow advances to the address step

### Requirement: Main-path answer precedence
At a listen checkpoint the runtime SHALL evaluate routing in order: side flow entry (if not main-path answer), main route match, Q&A interrupt (if not main-path answer), then advance.

#### Scenario: Side flow over Q&A
- **WHEN** the customer says "מה שלומך?" and side flow `small_talk` is configured
- **THEN** the side flow runs instead of product Q&A interrupt

## MODIFIED Requirements

### Requirement: Global product Q&A interrupt
During any stage marked `interruptible: true` **or** any graph-flow listen checkpoint with `interruptQa: true`, product-related customer questions SHALL be answered using catalog-backed knowledge and LLM assistance **without advancing the stage or main route**, unless the utterance matches an explicit main-path answer, side flow intent, or `advanceOn` intent for staged flows.

#### Scenario: Channel question during opening
- **WHEN** the customer is on stage `opening` and asks "יש לכם ספורט 5?"
- **THEN** the AI answers from catalog context and remains on stage `opening` (listen resumes)

#### Scenario: Internet question mid-stage
- **WHEN** the customer asks about internet speeds during an interruptible stage
- **THEN** the AI answers using internet tier knowledge and the call resumes the same `currentStageId`

#### Scenario: Qualification answer on graph flow
- **WHEN** the customer provides a scoped qualification answer at the active listen node
- **THEN** Q&A interrupt does not run and the main route advances
