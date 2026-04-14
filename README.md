# CRM Automations

Backend service for WareOnGo that parses natural-language RFQ (Request for Quotation) messages into structured CRM opportunities using AI, pushes them into Twenty CRM, and sends automated follow-up reminders for stale leads.

## Architecture

```
frontend/          Static HTML/JS frontend for submitting RFQs
src/
  server.js        Entry point
  app.js           Express config (CORS, JSON, routes)
  routes/          Route definitions
  controllers/     Request handlers
  services/
    rfq.service.js       AI-powered RFQ parsing (OpenAI)
    twenty.service.js    CRM API integration (Twenty)
    email.service.js     Email sending (Resend)
    webhook.service.js   CRM webhook handler (upserts opportunities)
    reminder.service.js  Reminder logic with retry
  lib/
    prisma.js        Prisma client singleton
prisma/
  schema.prisma    Database schema (Opportunity model)
sql/
  create_opportunities.sql   Table creation for Supabase
  pg_cron_reminders.sql      Cron schedules for automated reminders
```

## Setup

### Prerequisites

- Node.js v22+
- OpenAI API key
- Twenty CRM instance with API key
- Supabase project (PostgreSQL + pg_cron + pg_net)
- Resend API key (free tier: 100 emails/day)

### Install

```bash
npm install
npx prisma generate
```

### Environment Variables

Create a `.env` file in the project root:

```env
PORT=3000
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
TWENTY_CRM_BASE_URL=https://crm.wareongo.com
TWENTY_CRM_API_KEY=eyJ...
RFQ_MODEL=gpt-4o              # optional, defaults to gpt-4o
RESEND_API_KEY=re_...
RESEND_FROM=onboarding@resend.dev  # optional, defaults to Resend test sender
```

### Run

```bash
# Development (with file watching)
npm run dev

# Production
npm start
```

## Reminder System

Automated email reminders for leads sitting in "RFQ Received" without activity:

- **1 hour** — quick nudge
- **1 day** — end-of-day follow up
- **3 days** — final escalation

Runs via pg_cron in Supabase (every 15 min). See [SETUP-REMINDERS.md](SETUP-REMINDERS.md) for full setup instructions.

## Deployment (Render)

| Setting | Value |
|---|---|
| Environment | Node |
| Root Directory | `/` |
| Build Command | `npm install && npx prisma generate` |
| Start Command | `npm start` |

Set environment variables in the Render dashboard: `OPENAI_API_KEY`, `TWENTY_CRM_BASE_URL`, `TWENTY_CRM_API_KEY`, `DATABASE_URL`, `RESEND_API_KEY`.

**Live URL:** https://twenty-automations.onrender.com

## Frontend

The `frontend/` folder contains a static HTML/JS/CSS app for submitting RFQs. Open `frontend/index.html` in a browser. Toggle the `API_URL` in `frontend/app.js` between `localhost` and the Render URL.

## Parsing Rules

- **Name format:** `Company - Space - Area, City`
- **Amount:** Only populated when total deal size is explicitly mentioned
- **Budget:** Per square foot rate
- **Duration:** Defaults to `LONG_TERM`; `SHORT_TERM` only if explicitly under 1 year
- **Stage:** Defaults to `RFQ_RECEIVED`; recognizes other stages when explicitly stated (handles misspellings)
- **Description:** Always set to the raw RFQ text verbatim
- **Lead Source:** `GODAMWALE`, `BROKER`, or `DIRECT`
