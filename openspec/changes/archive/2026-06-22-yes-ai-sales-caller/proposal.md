## Why

Outbound sales for YES (Israeli TV, phone, and internet provider) requires many repetitive calls to a closed contact list. A Hebrew-speaking AI caller can scale outreach, deliver consistent packet information, handle interruptions and questions in real time, and track outcomes—while operators manage contacts, configuration, and call flow from a single application.

## What Changes

- Build a new Hebrew-first desktop/web application for AI-powered outbound sales calls to YES customers and prospects
- Add contact management: closed list, CRUD, call initiation, and sale status tracking (sold, in progress, refused / do-not-call)
- Add configuration for sales packets, channel bundles, pricing/options, opening lines (with customer name), and configurable call flow scripts
- Integrate real-time voice AI that speaks and understands Hebrew, can be interrupted mid-speech, and answers questions about all configured packets and options
- Add telephony integration to physically place outbound calls to contacts from the managed list
- Add operator UI in Hebrew for contacts, calls, configuration, and call outcome review

## Capabilities

### New Capabilities

- `contact-management`: Closed contact list with add/edit/delete, call history, and sale status (sold, pending, refused / do-not-call)
- `sales-configuration`: Admin configuration of YES sales packets, channel options, pricing tiers, and product metadata the AI must know
- `call-flow-configuration`: Configurable opening lines (including customer name substitution), conversation stages, and objection-handling flow
- `hebrew-voice-ai`: Real-time Hebrew STT/TTS with barge-in (interrupt while speaking), contextual Q&A over configured products
- `telephony-outbound`: Physical outbound calling to contacts via telephony provider integration
- `operator-ui`: Hebrew operator interface for contacts, calling, configuration, and monitoring active calls

### Modified Capabilities

_(none — greenfield project)_

## Impact

- New application from scratch (no existing codebase)
- External dependencies: telephony provider (e.g., Twilio or Israeli SIP/PSTN provider), Hebrew-capable speech-to-text and text-to-speech, LLM for conversational sales logic
- Hebrew RTL UI throughout
- Real-time audio streaming pipeline (low latency required for natural interruption)
- Local or cloud storage for contacts, configuration, and call logs
- Compliance considerations: do-not-call list enforcement, call recording consent (Israeli regulations)
