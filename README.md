# YES AI Caller

Hebrew-first AI outbound sales application for YES (TV, phone, internet). Operators manage a closed contact list, configure sales packets and call flows, and initiate AI-powered outbound calls.

## Stack

- **Backend:** Node.js, Express, TypeScript, Prisma, SQLite
- **Frontend:** React, Vite, Tailwind CSS (RTL Hebrew UI)
- **Telephony:** Twilio (production) or mock provider (development)
- **AI:** OpenAI, Deepgram, ElevenLabs (optional — fallback logic when keys not set)

## Quick start

```bash
# Install dependencies
npm install
cd server && npm install && cd ../client && npm install && cd ..

# Configure environment
cp .env.example server/.env
# Edit server/.env — set ENCRYPTION_KEY (32+ chars)

# Database
cd server
npx prisma migrate dev
npm run db:seed

# Run (from repo root)
npm install concurrently
npm run dev
```

- API: http://localhost:3001/health
- UI: http://localhost:5173 (Hebrew RTL)

## Twilio webhooks (production)

Set `TWILIO_WEBHOOK_BASE_URL` to your public URL (e.g. ngrok). Webhooks:

- `POST /api/webhooks/twilio/voice` — call answer TwiML
- `POST /api/webhooks/twilio/status` — call status updates
- WebSocket `/api/webhooks/twilio/media?callId=...` — bidirectional audio

## Development mode

With `TELEPHONY_PROVIDER=mock` (default), clicking **התקשר** simulates a full AI call locally without placing real PSTN calls. Seed data includes sample contacts, YES packets, and a default Hebrew call flow with recording disclosure.

## Project structure

```
server/     Express API, voice orchestration, telephony
client/     React Hebrew RTL operator UI
shared/     Shared TypeScript types
openspec/   OpenSpec change proposals and specs
```

## .NET note

The .NET SDK was not available on this machine during initial setup. To use ASP.NET Core instead, install the .NET 8 SDK and we can migrate the backend.
