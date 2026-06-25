## ADDED Requirements

### Requirement: Auto-advance informational speak nodes
Informational speak nodes that are not questions (e.g. fiber availability announcements, no-internet acknowledgment, pre-callback summary) SHALL chain directly to the next speak node without entering a listen checkpoint. The graph MAY mark such nodes with `autoAdvance: true` and a speak → speak edge to the next question.

#### Scenario: Fiber yes announcement continues to speed question
- **WHEN** the runtime finishes `speak_fiber_yes` on the Sigal MiniFlow
- **THEN** the AI immediately speaks `speak_speed_fiber` without waiting for customer input

#### Scenario: Summary continues to callback question
- **WHEN** the runtime finishes `speak_summary`
- **THEN** the AI immediately speaks `speak_callback` without waiting for customer input

#### Scenario: Orphan announcement route auto-continues
- **WHEN** the engine lands on an intent_route whose only incoming edges are from speak nodes and whose outgoing edges target speak nodes
- **THEN** the runtime auto-advances to the default speak target in the same turn

### Requirement: Graph enhance preserves operator speak text
`enhanceSigalGraph` SHALL patch routing, variable bindings, side flows, and auto-advance topology only. It SHALL NOT replace existing speak node `text` with default template constants.

#### Scenario: Publish retains niqqud opening
- **WHEN** an operator publishes a graph whose `speak_opening` includes Hebrew niqqud characters
- **THEN** the published graph retains the same `speak_opening.text` after enhancement

### Requirement: Default Sigal opening includes TV qualification
The default Sigal MiniFlow template SHALL combine the compliance opening and the TV count question in `speak_opening`, then connect `speak_opening` → `listen_tv` → `route_tv` → `speak_inet`. The internet speak node SHALL acknowledge the bound TV count before asking about internet type.

#### Scenario: Combined opening speaks TV question
- **WHEN** a new call starts on the default Sigal MiniFlow graph
- **THEN** the first utterance includes the compliance opener and ends with the TV count question

#### Scenario: Internet step acknowledges TV count
- **WHEN** the customer answers the TV count and the runtime advances to `speak_inet`
- **THEN** the AI speaks an acknowledgment including `NumOfTVs` before asking about internet infrastructure

## MODIFIED Requirements

### Requirement: Graph enhance on save and publish
Draft save and publish SHALL run graph enhancement (variable bindings, default side flows, variable auto-ensure, auto-advance announcement patching, TV variable consolidation) before persisting and validating. Enhancement SHALL NOT overwrite operator-authored speak node text.

#### Scenario: Save draft adds missing CustomerAddress variable
- **WHEN** an operator saves a draft with `listen_address` binding but only `NumOfTVs` in variables
- **THEN** the saved draft includes `CustomerAddress` in `variables` automatically

#### Scenario: Publish preserves custom speak copy
- **WHEN** an operator publishes a graph with customized `speak_inet` text
- **THEN** the published graph keeps the customized text while still receiving routing and binding patches
