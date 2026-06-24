## ADDED Requirements

### Requirement: Variable-based decision routing
The graph flow runtime SHALL evaluate decision node edge conditions against session variables and lookup tables after listen bindings are applied, selecting the first matching non-default edge or the default edge.

#### Scenario: Route on variable comparison
- **WHEN** the active node is `decision`, session variable `NumOfTVs` is `1`, and edge A has condition `var_eq NumOfTVs 1`
- **THEN** the engine advances to edge A's target node

#### Scenario: Route on lookup exists
- **WHEN** the active node is `decision`, variable `RequestedChannel` is "ספורט 5", and edge A has `lookup_exists` on table `Channels` column `name`
- **THEN** the engine follows edge A if a matching row exists, otherwise the default edge

### Requirement: Apply listen bindings after classification
After classification on a listen node, the runtime SHALL apply configured variable bindings before advancing to intent_route or decision nodes.

#### Scenario: Bind then route
- **WHEN** listen node bindings set `NumOfTVs` from classification and the next node is a decision on `NumOfTVs`
- **THEN** the binding is applied in the same turn before decision evaluation

## MODIFIED Requirements

### Requirement: Configurable opening line
Operators SHALL configure the call opening via the visual flow builder's start speak node (or dedicated opening node), with template variables including `{{customer_full_name}}`, `{{customer_first_name}}`, legacy `{{customer_name}}` (alias for full name), and flow session variables. The default opening SHALL introduce the agent as **Sigal** from YES.

#### Scenario: Opening line with customer name
- **WHEN** a call starts for contact "דוד כהן" and the opening speak node template is "שלום {{customer_first_name}}, מדברת סיגל מ-YES"
- **THEN** the AI speaks "שלום דוד, מדברת סיגל מ-YES" as the first utterance

#### Scenario: Preview opening line
- **WHEN** an operator edits the opening speak node in the flow builder
- **THEN** a live preview shows the rendered text with a sample customer name and sample flow variable values

### Requirement: Multi-stage call flow
Operators SHALL configure call flows as directed graphs (visual flow builder) with nodes for speech, listening, decisions, intent-based branches, and variable/lookup-based decision branches. Linear stage lists MAY be imported into a graph for backward compatibility.

#### Scenario: Flow progresses through graph nodes
- **WHEN** the AI completes a speak node and the customer response is classified with a matching intent edge
- **THEN** the runtime advances to the target node on that edge

#### Scenario: Flow progresses via variable decision
- **WHEN** the AI completes a listen node that sets `NumOfTVs` and the next decision node branches on `NumOfTVs >= 2`
- **THEN** the runtime advances to the branch matching the variable value

#### Scenario: Reorder flow via graph edit
- **WHEN** an operator reconnects nodes and publishes the graph
- **THEN** new calls follow the updated graph topology
