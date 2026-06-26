## 1. OpenSpec & schema

- [x] 1.1 Add change proposal, design, and capability specs
- [x] 1.2 Prisma migration: conversation mode, agent config, examples, call mode snapshot

## 2. Server

- [x] 2.1 Conversation mode get/save in settings service
- [x] 2.2 Agent config CRUD and example library API
- [x] 2.3 `agentRuntime` + `generateAgentReply` with catalog + examples
- [x] 2.4 Branch `processCustomerTurn` / opening on `call.conversationMode`

## 3. Client

- [x] 3.1 Header Flow/Agent mode switch
- [x] 3.2 Agent page (mission, limits, policies, examples)
- [x] 3.3 Calls page: correct AI response → example library
- [x] 3.4 Show mode badge on active call

## 4. Specs sync

- [x] 4.1 Add `openspec/specs/autonomous-sales-agent/spec.md`
- [x] 4.2 Update `operator-ui` and `hebrew-voice-ai` specs

## 5. Test-call polish (2026-06-26)

- [x] 5.1 Browser test: no 20s silence retry
- [x] 5.2 Browser test: skip-voice checkbox + `voice_skipped` protocol
- [x] 5.3 TTS quota-aware errors and v3→flash fallback
- [x] 5.4 Agent opening uses template only (no LLM on first turn)
- [x] 5.5 Sync `browser-test-call`, `operator-ui`, `hebrew-voice-ai` specs
