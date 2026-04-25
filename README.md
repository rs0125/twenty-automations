# CRM Automations

Backend service for WareOnGo. Parses natural-language RFQ messages from WhatsApp into structured CRM opportunities (via OpenAI), pushes them into Twenty CRM, and sends automated email reminders for stale leads.

This service sits between two upstream systems:

- **WhatsApp ingestion service** (separate repo: `whatsapp-logistics-bot`) — relays Twilio WhatsApp messages here as RFQs, including the sender's phone number.
- **Twenty CRM** — fires webhooks on opportunity create/update; we mirror those rows locally so a Postgres `pg_cron` job can drive reminder emails.

## Architecture

```
WhatsApp → Twilio → whatsapp-logistics-bot ──── POST /rfq ─────▶ this service
                                                                       │
                                                                       │ creates
                                                                       ▼
                                                                   Twenty CRM
                                                                       │
                                                       webhook on every create/update
                                                                       │
                                                                       ▼
                                                            POST /webhook/twenty
                                                                       │
                                                                       ▼
                                                            opportunities table
                                                                  (Supabase Postgres)
                                                                       │
                                                              pg_cron every 15 min
                                                                       │
                                                            POST /send-reminder
                                                                       │
                                                                       ▼
                                                                Resend → email
```

## Repository layout

```
src/
  server.js            Entry point
  app.js               Express config (CORS, JSON, urlencoded, routes)
  routes/              Route definitions (health, rfq, email, webhook, reminder)
  controllers/         Request handlers
  services/
    rfq.service.js         AI-powered RFQ parsing + assignee inference (OpenAI)
    twenty.service.js      Twenty CRM REST integration (create + fetch opportunity)
    email.service.js       Email send via Resend (To: + Cc:)
    webhook.service.js     Twenty webhook handler — recovers malformed bodies, upserts, resolves creator
    reminder.service.js    Reminder send + retry/backoff
    users.service.js       Phone/Twenty-id lookups against VerifiedNumber
  lib/
    prisma.js          Prisma client singleton
prisma/
  schema.prisma        Generated from Supabase (Opportunity, VerifiedNumber, …)
sql/                   (gitignored) Local copy of the SQL run against Supabase:
  create_opportunities.sql
  alter_opportunities_reminders.sql
  pg_cron_reminders.sql
frontend/              Static HTML/JS for manual RFQ submission
```

## Setup

### Prerequisites

- Node.js v22+
- OpenAI API key
- Twenty CRM instance with API key
- Supabase project (PostgreSQL + `pg_cron` + `pg_net` extensions)
- Resend API key

### Install

```bash
npm install
npx prisma generate
```

### Environment variables

Create a `.env` file in the project root. See `.env.example` for the full list.

| Variable | Required | Notes |
|---|---|---|
| `PORT` | no | defaults to 3000 |
| `DATABASE_URL` | yes | Supabase Postgres URL |
| `OPENAI_API_KEY` | yes | for RFQ parsing |
| `RFQ_MODEL` | no | defaults to `gpt-4o` |
| `TWENTY_CRM_BASE_URL` | yes | e.g. `https://crm.wareongo.com` |
| `TWENTY_CRM_API_KEY` | yes | Twenty API key (long-lived JWT) |
| `RESEND_API_KEY` | yes | for reminder emails |
| `RESEND_FROM` | no | defaults to Resend's sandbox sender |
| `ASSIGNABLE_USERS` | yes | Comma-separated list of Twenty `assignedTo` enum values (uppercased first names). Used to validate names extracted from RFQ messages. Update + restart when the team changes. |
| `REMINDER_SECRET` | yes | Shared secret. The `/send-reminder` endpoint validates the `X-Auth` header against this. Must match what `pg_cron_reminders.sql` sends. |

### Run

```bash
npm run dev    # development with file watch
npm start      # production
```

## Key flows

### `POST /rfq` — RFQ from WhatsApp

Body: `{ rfq: string, senderNumber?: string }`. The OpenAI parser extracts structured fields *and* an `assignedTo` list when the message explicitly says "assign to X" / "X please handle this" / etc. Names are validated against `ASSIGNABLE_USERS`; unknowns are dropped silently. If `senderNumber` matches a row in `VerifiedNumber`, the opportunity's `createdBy` is set to that workspace member so Twenty attributes the deal correctly.

### `POST /webhook/twenty` — Twenty webhook ingest

Twenty sends opportunity events with `Content-Type: application/x-www-form-urlencoded` but a JSON body, with literal newlines inside string values. The handler detects this shape, sanitizes unescaped control characters, and parses. After the upsert, it fetches the opportunity from Twenty REST to read `createdBy.workspaceMemberId`, looks up that member's email via `VerifiedNumber.twenty_user_id`, and prepends the creator's email to `assignee_email`. Result: the creator becomes the primary `To:` recipient on every reminder, with assignees in `Cc:`.

### `POST /send-reminder` — driven by pg_cron

`pg_cron` runs every 15 minutes against the `opportunities` table, finds rows in `RFQ_RECEIVED` that haven't been touched for 1h / 1d / 3d, and `POST`s here with `{ opportunityId, assigneeEmail, step }`. The endpoint is gated by an `X-Auth` shared-secret header. The service sends through Resend (with retry/backoff), then the cron reconciler flips `reminder_<step>_sent = true`.

See [SETUP-REMINDERS.md](SETUP-REMINDERS.md) for the full Supabase setup.

## Deployment

Single AWS EC2 instance in `ap-south-1`, behind Caddy on `:80`, managed by pm2. Auto-deploys via GitHub Actions on push to `main`.

See [DEPLOYMENT.md](DEPLOYMENT.md) for full details (instance IDs, SSH, secrets, troubleshooting).

## API reference

See [API.md](API.md).

## Frontend

`frontend/` is a static HTML/JS form for manual RFQ submission. Open `frontend/index.html` directly. Toggle the `API_URL` in `frontend/app.js` between localhost and the deployed host.
