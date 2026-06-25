## Context

Sigal MiniFlow uses visible speak → listen → route triplets per qualification stage. Informational announcements (fiber result, no-internet ack, package summary) are **not** questions—the customer should hear the line and immediately receive the next prompt.

A prior migration replaced the published graph with `createSigalMiniFlowGraph()` defaults, losing operator edits (niqqud, combined opening/TV script, inet acknowledgment).

## Goals

- Announcement speaks chain to the next question without a listen wait
- Graph validation passes after removing unreachable orphan listen/route nodes
- `enhanceSigalGraph` is safe to run on publish without clobbering speak copy
- Default template matches operator-intended v19 content

## Decisions

### `autoAdvance` + speak → speak edges

`patchSigalAutoAdvanceSpeaks` sets `autoAdvance: true` on known announcement speaks, adds direct edges to the next question speak, and removes the intermediate listen/route nodes from the graph. `getNextAutoEdge` prefers these chains at runtime.

### Orphan route runtime guard

If enhancement is skipped on an old graph, `isOrphanAnnouncementRoute` detects route nodes whose only incoming edges are from speak nodes and whose outgoing edges target speaks; `callService` auto-continues in the same turn.

### Combined opening + TV question

Default topology: `speak_opening` (includes compliance opener **and** TV count question) → `listen_tv` → `route_tv` → `speak_inet`. No separate `speak_tv` or `listen_opening` in the default template.

### Enhance scope

`enhanceSigalGraph` = routing fixes + auto-advance patch + TV variable consolidation + variable bindings. It does **not** inject `STAGED_OPENING` over existing `speak_opening.text`.

## Risks / Trade-offs

- Operators who split opening and TV into separate nodes must reconnect manually; the default template no longer uses a separate TV speak stage
- `route_tv` default edge advances to internet without repeating the TV question (v19 behavior); "לא הבנתי" still repeats via runtime repeat logic at the listen checkpoint
