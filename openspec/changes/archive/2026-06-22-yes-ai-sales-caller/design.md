## Context

Greenfield application for AI-powered outbound sales calls on behalf of YES (Israeli TV, phone, and internet provider). Operators manage a closed Hebrew-speaking contact list, configure product catalog and call scripts, and initiate calls where a Hebrew voice AI pitches configurable packets, handles interruptions, and tracks outcomes.

Constraints:
- Hebrew-only UI and voice (RTL layout, Israeli phone numbers)
- Real-time voice with barge-in (customer can interrupt AI mid-speech)
- Closed contact list with refusal / do-not-call enforcement
- Configurable sales catalog, opening lines, and multi-stage call flow
- Physical PSTN/mobile outbound calls (not browser-only WebRTC to customer)

## Goals / Non-Goals

**Goals:**
- End-to-end outbound calling with Hebrew conversational AI
- Operator dashboard for contacts, configuration, and call monitoring
- Accurate product Q&A grounded in configured YES packets and options
- Sale outcome tracking (sold, callback, refused) with call history
- Low-latency voice pipeline supporting interruption (<500 ms TTS stop, <2 s round-trip)

**Non-Goals (v1):**
- CRM integration with YES billing/activation systems
- Inbound call handling
- Payment collection or contract signing on the call
- Multi-tenant / multi-operator role-based access (single operator desk acceptable for v1)
- Full human agent handoff (listen-only monitoring is sufficient for v1)
- Mobile native apps (web-first responsive UI)

## Decisions

### 1. Application architecture: Monolith with real-time voice service

**Decision:** Node.js backend (TypeScript) + React frontend (Vite), with a dedicated real-time voice orchestration module in the same process (or sidecar worker).

**Rationale:** Single deployable unit simplifies v1 development. Voice orchestration needs tight coupling with call state, contact data, and configuration. Can extract voice worker later if scale demands.

**Alternatives considered:**
- Microservices from day one — rejected; premature complexity for greenfield
- Python-only stack — viable for AI but weaker real-time telephony ecosystem in one codebase

### 2. Database: SQLite (dev/small deploy) with PostgreSQL migration path

**Decision:** SQLite via Prisma ORM for v1 local/single-server deploy; schema designed for PostgreSQL compatibility.

**Rationale:** Zero-infra local dev; sufficient for closed-list sales desk. Prisma eases migration to PostgreSQL for production.

### 3. Telephony: Twilio Programmable Voice (primary), abstract provider interface

**Decision:** Integrate Twilio for outbound PSTN calls with Media Streams for bidirectional audio. Define `TelephonyProvider` interface to swap in Israeli SIP providers (e.g., Voicenter, PayCall) later.

**Rationale:** Twilio has mature Media Streams, webhook model, and Israeli number support. Abstraction avoids lock-in.

**Flow:**
```
Operator → API "start call" → Twilio dials contact
→ on answer: Twilio Media Stream (WebSocket) ↔ Voice Orchestrator
→ Orchestrator: STT → LLM → TTS loop
```

### 4. Hebrew voice AI pipeline

**Decision:** Streaming pipeline with these components:

| Layer | Choice | Notes |
|-------|--------|-------|
| STT | Deepgram (Hebrew) or OpenAI Realtime | Streaming, low latency |
| LLM | OpenAI GPT-4o or Claude | System prompt + RAG over sales config |
| TTS | ElevenLabs (Hebrew voice) or OpenAI TTS | Natural Israeli Hebrew |
| Orchestration | Custom state machine | Drives call-flow stages, handles barge-in |

**Barge-in implementation:**
- Continuous STT stream runs in parallel with TTS output
- Voice Activity Detection (VAD) on inbound audio triggers TTS cancellation
- On interrupt: flush TTS buffer, send customer transcript to LLM, generate response
- Resume logic tracks `current_stage` and `spoken_segment_offset` in call session state

**RAG for product knowledge:**
- On configuration save, index packets/channels/options into structured JSON + embedding store (or inject full catalog into system prompt if small enough for v1)
- LLM tool call `lookup_packet`, `lookup_channels`, `list_packets` for precise answers

### 5. Call flow engine

**Decision:** JSON-defined state machine stored in DB, rendered by a `CallFlowEngine` service.

**Structure:**
```json
{
  "opening_template": "שלום {{customer_name}}, מדברת נציגת YES",
  "stages": [
    { "id": "greeting", "prompt": "...", "next": "qualification" },
    { "id": "qualification", "prompt": "...", "next": "pitch" },
    { "id": "pitch", "prompt": "...", "next": "closing" }
  ],
  "objections": {
    "price": "התגובה המוגדרת למחיר גבוה...",
    "not_interested": "..."
  }
}
```

Template variables resolved at call start from contact record. Version ID snapshotted per call session.

### 6. Frontend: React + Tailwind + RTL

**Decision:** React 18, Vite, Tailwind CSS with `dir="rtl"` and Hebrew font (e.g., Heebo). TanStack Query for API state. shadcn/ui components adapted for RTL.

### 7. API design: REST + WebSocket

**Decision:**
- REST API for CRUD (contacts, config, calls history)
- WebSocket for live call monitoring (transcript chunks, call state events)

### 8. Security and compliance

**Decision:**
- Encrypt telephony and AI API keys at rest (AES-256, env-derived key)
- Log consent opening line in default flow ("שיחה זו מוקלטת לצורכי איכות")
- Enforce `refused` status at API and telephony layers (defense in depth)
- No PII in application logs; transcripts stored encrypted or access-controlled

## Data Model (core entities)

```
Contact: id, name, phone, status, notes, createdAt, updatedAt
Call: id, contactId, flowVersionId, status, outcome, startedAt, endedAt, durationSec
CallTranscript: id, callId, segments[{speaker, text, timestamp}]
SalesPacket: id, nameHe, descriptionHe, priceMonthly, contractMonths, active, inclusions[]
ChannelPackage: id, nameHe, channels[], priceAddon
InternetTier: id, nameHe, downloadMbps, uploadMbps, priceMonthly
PhonePlan: id, nameHe, features[], priceMonthly
CallFlow: id, version, openingTemplate, stagesJson, objectionsJson, isActive
AppSettings: telephonyConfig, aiConfig (encrypted)
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Hebrew STT accuracy on phone audio (8 kHz) | Use telephony-optimized STT; tune VAD thresholds; test with native speakers |
| Barge-in latency feels unnatural | Target <500 ms TTS stop; pre-buffer short responses; test extensively |
| LLM hallucinates prices/channels | Ground responses via tool calls to config DB; never free-form pricing |
| Twilio cost at scale | Monitor per-call cost; abstract provider for local Israeli rates |
| Israeli telemarketing regulations | Include recording disclosure; honor refused list; legal review before production |
| OpenAI/Deepgram API downtime | Graceful call termination with operator notification; retry queue |

## Migration Plan

1. **Phase 1 — Foundation:** Project scaffold, DB, contacts CRUD, Hebrew RTL UI shell
2. **Phase 2 — Configuration:** Sales catalog, call flow editor, settings
3. **Phase 3 — Telephony:** Twilio integration, outbound dial, call state webhooks
4. **Phase 4 — Voice AI:** STT/TTS/LLM pipeline, barge-in, product Q&A
5. **Phase 5 — Integration:** End-to-end call with outcome tracking, transcripts, dashboard
6. **Phase 6 — Hardening:** Latency tuning, error handling, compliance copy, deployment docs

Rollback: Each phase is independently deployable; telephony can be disabled via feature flag without affecting contact management.

## Open Questions

1. **Telephony provider:** Twilio confirmed for v1, or required Israeli SIP provider from day one?
2. **AI provider budget:** OpenAI Realtime (all-in-one) vs. separate STT+LLM+TTS (more control, more integration work)?
3. **Deployment target:** Local Windows desktop, on-prem server, or cloud (Azure/AWS)?
4. **Call recording:** Store full audio recordings in addition to transcripts? Retention policy?
5. **YES branding/legal:** Official YES partner approval needed for production use of brand name and offers?
6. **Authentication:** Single shared login for v1, or operator accounts required from start?
