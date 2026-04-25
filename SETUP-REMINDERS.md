# Reminder System — Setup Guide

This guide covers the Supabase-side wiring for the automated reminder flow. The service-side code is already deployed (see [DEPLOYMENT.md](DEPLOYMENT.md)).

---

## How it works

1. **Twenty CRM** fires a webhook on every opportunity create/update.
2. The service receives it at `POST /webhook/twenty`, recovers the body (Twenty sends JSON as urlencoded), and upserts the row into Supabase. Any activity resets `last_activity_at` and clears unsent reminder flags.
3. After the upsert, the service GETs the opportunity from Twenty REST, resolves the creator's email via `VerifiedNumber.twenty_user_id`, and prepends it to `assignee_email`. The creator becomes the primary `To:` recipient on every reminder; assignees go to `Cc:`.
4. **`pg_cron`** runs every 15 minutes and `POST`s to `/send-reminder` for any row in `RFQ_RECEIVED` that's been idle past a threshold (1h / 1d / 3d).
5. The endpoint sends through Resend with retry/backoff. The Postgres reconciler flips `reminder_<step>_sent` based on the response.

If the lead is updated at any point, `last_activity_at` resets and pending reminders naturally don't fire.

---

## Prerequisites

- Supabase project (you already have `DATABASE_URL`).
- Resend account with API key.
- Twenty CRM with webhook support and an API key.
- This service deployed and reachable from Supabase (see [DEPLOYMENT.md](DEPLOYMENT.md) for the public host).

---

## Step 1 — Database tables

Run the SQL files in `sql/` in your **Supabase SQL Editor**, in order:

1. `sql/create_opportunities.sql` — base `opportunities` table.
2. `sql/alter_opportunities_reminders.sql` — adds reminder tracking columns.

`sql/` is gitignored locally; the canonical copies live on the dev box.

The `VerifiedNumber` table already exists in this Supabase project (it's shared with the WhatsApp ingestion service). For the reminder flow it must have the columns added in this repo — `twenty_user_id` and `email`, both nullable + unique. `prisma db pull` will surface the current shape.

---

## Step 2 — Service env vars

The reminder flow needs:

```env
DATABASE_URL=postgresql://...
RESEND_API_KEY=re_...
RESEND_FROM=notifications@wareongo.com   # optional
TWENTY_CRM_BASE_URL=https://crm.wareongo.com
TWENTY_CRM_API_KEY=eyJ...
```

The `TWENTY_CRM_*` vars are required — they're used by the webhook handler to resolve the creator after each upsert.

Update `.env` on the EC2 box (see [DEPLOYMENT.md → "Update the .env"](DEPLOYMENT.md)) and `pm2 restart crm-automations --update-env`.

---

## Step 3 — Twenty webhook

In Twenty CRM, create a webhook with:

| Setting | Value |
|---|---|
| URL | `http://<EC2_PUBLIC_DNS>/webhook/twenty` |
| HTTP Method | POST |
| Content-Type | (whatever Twenty defaults to — currently `application/x-www-form-urlencoded` with a JSON body, which we recover) |

**Body fields:**

| Key | Twenty Field |
|---|---|
| `id` | Id |
| `description` | Description |
| `last_updated` | Last update |
| `company` | Company Name |
| `POC Name` | First Name |
| `POC Phone Number` | Primary Phone Number |
| `created_at` | Creation date |
| `deal_name` | Name |
| `assigned_to` | Assigned to |
| `stage` | Stage |

Fire on **create** and **update** for opportunities.

---

## Step 4 — Configure pg_cron

Run `sql/pg_cron_reminders.sql` in the **Supabase SQL Editor**.

**Before running**, edit two things in the file:

1. Replace the `url := 'http://...'` value with your current EC2 public DNS / IP.
2. Change the `'X-Auth'` header value (currently the placeholder `'wareongodotcom'`) to a fresh shared secret. Set the same value as `REMINDER_SECRET` in the service `.env` (read by `src/routes/reminder.routes.js`).

This creates 3 scheduled jobs (all every 15 minutes):

- `reminder-1h` — nudge after 1 hour idle
- `reminder-1d` — nudge after 1 day idle
- `reminder-3d` — final nudge after 3 days idle

### Required extensions

In **Supabase Dashboard → Database → Extensions**, enable `pg_cron` and `pg_net` if they aren't already.

---

## Step 5 — Smoke tests

### Webhook

```bash
curl -X POST http://<EC2_PUBLIC_DNS>/webhook/twenty \
  -H 'Content-Type: application/json' \
  -d '{"id":"test-001","stage":"RFQ_RECEIVED","assigned_to":"Dhaval","deal_name":"Test","company":"Acme"}'
```

Expected: `{"received":true}` and a row in `opportunities`. Within a few seconds, `assignee_email` should be `dhaval@wareongo.com` (and the creator's email prepended if you posted with a real Twenty `id` whose `createdBy` resolves).

### Reminder send

```bash
curl -X POST http://<EC2_PUBLIC_DNS>/send-reminder \
  -H 'Content-Type: application/json' \
  -H 'X-Auth: <your shared secret>' \
  -d '{"opportunityId":"test-001","assigneeEmail":"dhaval@wareongo.com","step":"1h"}'
```

Expected: `{"sent":true}` and an email delivered. `reminder_1h_sent` flips to `true`.

### Confirm cron

```sql
SELECT * FROM cron.job;
```

You should see three jobs.

---

## Email recipient ordering

For each reminder the service splits the row's `assignee_email` on commas and uses the **first entry as `To:`** and the rest as `Cc:`. This is how creator-on-To-line is implemented end-to-end: at webhook time the creator's email is prepended (deduped case-insensitive).

The `assigned_to` string from Twenty maps to email like:

```
"Dhaval"           → dhaval@wareongo.com
"DHAVAL,RAGHAV"    → dhaval@wareongo.com,raghav@wareongo.com
```

Rule: strip whitespace, lowercase, append `@wareongo.com`.

---

## Monitoring failed reminders

Failed reminders persist the error in the row. Query:

```sql
SELECT opportunity_id, assignee_email, stage,
       reminder_1h_failed, reminder_1d_failed, reminder_3d_failed
FROM opportunities
WHERE reminder_1h_failed IS NOT NULL
   OR reminder_1d_failed IS NOT NULL
   OR reminder_3d_failed IS NOT NULL;
```

Common causes:

- `Resend API error` — bad/expired `RESEND_API_KEY`.
- `validation_error` — malformed email address (most often a stale `assigned_to` value that doesn't map cleanly).
- `rate_limit_exceeded` — hit the Resend free-tier ceiling (100/day).

---

## Disabling reminders

```sql
SELECT cron.unschedule('reminder-1h');
SELECT cron.unschedule('reminder-1d');
SELECT cron.unschedule('reminder-3d');
```

Re-running `sql/pg_cron_reminders.sql` re-creates them.
