## 1. Database and models

- [x] 1.1 Add Prisma models: `Intent`, `IntentExample`, `FlowGraph` (or extend `CallFlow` with `graphJson`, `publishedVersion`), `UtteranceClassification` linked to transcript segments
- [x] 1.2 Run migration and `prisma generate`; add indexes on `intentId`, `callId`
- [x] 1.3 Seed default intents (`greeting_ack`, `price_objection`, `ask_packet`, `ask_channel`, `not_interested`, `callback`, `agree_purchase`, `unknown`) with Hebrew examples

## 2. Channel knowledge layer

- [x] 2.1 Extend `yesCatalogService` with `findChannelByName`, `channelsInPacket`, `describeChannel`, fuzzy match helper
- [x] 2.2 Add REST routes `GET /api/catalog/channels`, `GET /api/catalog/channels/:id`, `GET /api/catalog/packets/:name/channels`
- [x] 2.3 Wire channel lookup into `productKnowledge` / LLM context builder for speak nodes

## 3. Intent classification service

- [x] 3.1 Implement `intentClassifier`: rule match on `IntentExample` phrases, then OpenAI JSON classification fallback
- [x] 3.2 Extract entities (`channel`, `packet`) from utterance + catalog fuzzy match
- [x] 3.3 Persist classification on each final STT segment (`intentId`, `confidence`, `entitiesJson`, `classifier`)
- [x] 3.4 Add API: list/create/update intents and examples; re-label utterance → add example

## 4. Graph flow runtime

- [x] 4.1 Define TypeScript types for `FlowNode`, `FlowEdge`, graph validation (start, end, default edges)
- [x] 4.2 Implement `GraphFlowEngine`: current node, `advance(classification)`, speak template render, version pin at call start
- [x] 4.3 Integrate into `callService` / `handleCustomerSpeech`: classify → advance → generate reply → TTS
- [x] 4.4 Migration utility: linear stages + objections → starter graph JSON
- [x] 4.5 Seed default YES starter flow graph (greeting → pitch → objection branches → close)

## 5. Server API for flows

- [x] 5.1 CRUD draft graph: `GET/PUT /api/flows/:id/graph`
- [x] 5.2 Validate and publish: `POST /api/flows/:id/publish` with Hebrew validation errors
- [x] 5.3 Import linear flow: `POST /api/flows/import-linear`

## 6. Flow Builder UI

- [x] 6.1 Add `@xyflow/react` and Hebrew RTL flow canvas page at `/flow-builder`
- [x] 6.2 Node types: speak, listen, decision, intent_route, end; property panels in Hebrew
- [x] 6.3 Edge labeling, intent picker on branches, validation panel, draft save and publish
- [x] 6.4 Template variable preview on speak nodes

## 7. Intent Management UI

- [x] 7.1 New page `/intents`: intent list, categories, example phrase editor
- [x] 7.2 Per-intent confidence threshold control
- [x] 7.3 Link from Calls transcript: re-label utterance and "add as example"

## 8. Calls UI and navigation

- [x] 8.1 Add nav items בניית זרימה and ניהול כוונות; legacy Call Flow redirects to builder or shows import banner
- [x] 8.2 Show intent badge + confidence on customer transcript lines in call detail
- [x] 8.3 Optional classification debug drawer per utterance

## 9. Integration and testing

- [x] 9.1 End-to-end test: simulated classification routes to correct graph node
- [x] 9.2 Manual test script: channel Q&A ("יש ספורט 5?", "מה בחבילת ילדים?") returns catalog-backed answers
- [x] 9.3 Verify in-progress call keeps graph version after publish
