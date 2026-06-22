## 1. Project Setup

- [x] 1.1 Initialize monorepo structure (`/server`, `/client`, shared types)
- [x] 1.2 Set up TypeScript, ESLint, Prettier for backend and frontend
- [x] 1.3 Configure Prisma with SQLite and define core schema (Contact, Call, SalesPacket, ChannelPackage, InternetTier, PhonePlan, CallFlow, AppSettings)
- [x] 1.4 Create `.env.example` with placeholders for Twilio, OpenAI, Deepgram, ElevenLabs keys
- [x] 1.5 Add Docker Compose optional profile for PostgreSQL production path

## 2. Backend Foundation

- [x] 2.1 Scaffold Express (or Fastify) server with health check endpoint
- [x] 2.2 Implement Prisma client singleton and run initial migration
- [x] 2.3 Add encrypted settings storage utility for API keys (AES-256)
- [x] 2.4 Set up WebSocket server for live call events
- [x] 2.5 Add global error handling, request validation (Zod), and structured logging

## 3. Contact Management API

- [x] 3.1 Implement `POST /api/contacts` with Israeli phone validation and duplicate check
- [x] 3.2 Implement `GET /api/contacts` with search, status filter, and pagination
- [x] 3.3 Implement `GET /api/contacts/:id` with call history relation
- [x] 3.4 Implement `PUT /api/contacts/:id` and `DELETE /api/contacts/:id` (soft delete)
- [x] 3.5 Enforce `refused` status logic in contact service (block call eligibility)
- [x] 3.6 Add contact status transition helpers (`pending` → `in_call` → `sold`/`callback`/`refused`)

## 4. Sales Configuration API

- [x] 4.1 Implement CRUD for SalesPacket with channel/internet/phone inclusions
- [x] 4.2 Implement CRUD for ChannelPackage, InternetTier, PhonePlan
- [x] 4.3 Add validation: active packets must reference existing options
- [x] 4.4 Build product knowledge indexer that refreshes on config save
- [x] 4.5 Implement LLM tool functions: `list_packets`, `lookup_packet`, `lookup_channels`
- [x] 4.6 Seed default YES sample packets and channels for development

## 5. Call Flow Configuration API

- [x] 5.1 Implement CallFlow CRUD with versioning (new version on save)
- [x] 5.2 Build template variable resolver (`{{customer_name}}`, extensible)
- [x] 5.3 Add opening line preview endpoint with sample contact
- [x] 5.4 Implement default Hebrew YES sales flow seed data
- [x] 5.5 Build CallFlowEngine state machine (stage transitions, objection routing)

## 6. Telephony Integration

- [x] 6.1 Define `TelephonyProvider` interface and Twilio implementation
- [x] 6.2 Implement `POST /api/calls/start` — dial contact, create Call record
- [x] 6.3 Implement `POST /api/calls/next` — select next eligible contact and dial
- [x] 6.4 Add Twilio webhook handlers: call status (ringing, answered, ended, busy, no-answer)
- [x] 6.5 Set up Twilio Media Streams WebSocket endpoint for bidirectional audio
- [x] 6.6 Block calls to `refused` contacts at API layer with Hebrew error response
- [x] 6.7 Implement telephony settings CRUD and connection test endpoint

## 7. Hebrew Voice AI Pipeline

- [x] 7.1 Integrate streaming Hebrew STT (Deepgram or OpenAI Realtime inbound)
- [x] 7.2 Integrate Hebrew TTS (ElevenLabs or OpenAI TTS) with telephony audio format (8 kHz μ-law)
- [x] 7.3 Build VoiceOrchestrator: session lifecycle tied to Call record
- [x] 7.4 Implement LLM conversation loop with system prompt (Hebrew sales persona, YES context)
- [x] 7.5 Wire product knowledge tools into LLM for accurate packet/channel Q&A
- [x] 7.6 Implement barge-in: VAD detection, TTS cancellation (<500 ms), interrupt handling
- [x] 7.7 Implement post-interrupt resume logic (stage offset tracking)
- [x] 7.8 Add outcome detection: parse sold/refused/callback intents and update contact status
- [x] 7.9 Generate post-call Hebrew transcript and structured summary
- [x] 7.10 Add latency metrics logging (STT, LLM, TTS, round-trip)

## 8. Frontend — Shell & RTL

- [x] 8.1 Scaffold React + Vite + Tailwind with `dir="rtl"` and Heebo Hebrew font
- [x] 8.2 Set up TanStack Query, React Router, and API client
- [x] 8.3 Build main layout with Hebrew navigation (אנשי קשר, שיחות, הגדרות מכירה, זרימת שיחה, הגדרות)
- [x] 8.4 Create dashboard page with summary metrics (contacts, pending, sold today, refused, active call)
- [ ] 8.5 Adapt shadcn/ui components for RTL layout

## 9. Frontend — Contacts

- [x] 9.1 Build contacts list table with search, status filter, and status badges
- [x] 9.2 Build add/edit contact modal with Israeli phone validation
- [ ] 9.3 Build contact detail view with call history and transcripts
- [x] 9.4 Add call action buttons (התקשר) with refused-contact guard
- [x] 9.5 Add delete confirmation dialog in Hebrew

## 10. Frontend — Calls

- [x] 10.1 Build calls dashboard with recent call log
- [x] 10.2 Build active call monitor with duration, stage, and live transcript (WebSocket)
- [x] 10.3 Add "התקשר לבא בתור" quick action button
- [x] 10.4 Display call outcome badges and link to transcript

## 11. Frontend — Configuration

- [ ] 11.1 Build sales packet management UI (list, create, edit, deactivate)
- [ ] 11.2 Build channel package, internet tier, and phone plan management screens
- [ ] 11.3 Build call flow editor (opening line with `{{customer_name}}` hints, stages, objections)
- [x] 11.4 Build opening line live preview component
- [x] 11.5 Build settings page for telephony and AI provider credentials with test button

## 12. Integration & End-to-End

- [x] 12.1 Connect full outbound call flow: dial → answer → AI greeting with customer name → pitch → Q&A
- [ ] 12.2 Test barge-in: customer interrupts mid-pitch, AI stops and answers
- [ ] 12.3 Test product Q&A against configured packets (price, channels, terms)
- [ ] 12.4 Test outcome flows: sold, refused (do-not-call), callback, no-answer
- [ ] 12.5 Verify refused contacts are excluded from call-next queue

## 13. Compliance & Hardening

- [x] 13.1 Add recording disclosure to default opening flow
- [x] 13.2 Ensure PII is not written to application logs
- [x] 13.3 Add rate limiting on API endpoints
- [x] 13.4 Write README with setup instructions (Hebrew UI note, env vars, Twilio webhook config)
- [ ] 13.5 Latency tuning pass: target <2 s round-trip, <500 ms barge-in stop
