## ADDED Requirements

### Requirement: Transcript line flow navigation
The call detail view (פרטי שיחה) SHALL provide an action on each transcript line that has an associated `flowNodeId` to open **בניית זרימה** with that node focused.

#### Scenario: Jump from AI line to speak node
- **WHEN** an operator views an AI transcript line with `flowNodeId` `speak_inet`
- **THEN** a control (e.g. "ערוך בזרימה") navigates to `/flow-builder?focus=speak_inet`

#### Scenario: Jump from customer line to listen node
- **WHEN** a customer transcript line has `flowNodeId` `listen_tv` from classification time
- **THEN** the operator can open the flow builder focused on `listen_tv`

#### Scenario: No button without node id
- **WHEN** a legacy transcript line has no `flowNodeId`
- **THEN** no flow-navigation control is shown for that line

### Requirement: Active call indicator across navigation
While a call is active (`connected`, `dialing`, or `ringing`), the operator UI SHALL show a persistent indicator in the app shell so the operator knows the call is still live when viewing sections other than **שיחות**.

#### Scenario: Indicator visible on flow builder during test call
- **WHEN** a browser test call is `connected` and the operator opens **בניית זרימה**
- **THEN** a compact active-call indicator remains visible with a link back to **שיחות**

## MODIFIED Requirements

### Requirement: Calls dashboard
The calls section SHALL show active calls, recent call log, and quick actions; **call detail view SHALL display intent label and confidence on each customer transcript line**, and **flow-navigation actions on lines with `flowNodeId`**.

#### Scenario: View transcript with intents
- **WHEN** an operator opens a completed call detail
- **THEN** each customer utterance shows its classified intent badge and optional re-label action linking to Intent Management

#### Scenario: Edit flow from live transcript
- **WHEN** an operator is on an active call detail and clicks flow navigation on the latest AI line
- **THEN** the flow builder opens with that speak node selected without ending the call
