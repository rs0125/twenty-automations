# RFQ Follow-up Reminder System - Setup Guide

This guide walks you through setting up the automated reminder system that sends email nudges when leads sit untouched in the "RFQ Received" stage.

---

## How It Works

1. **Twenty CRM** fires a webhook on every opportunity create/update
2. Our service receives it at `POST /webhook/twenty` and upserts the record into Supabase, recording when it was last touched
3. **pg_cron** runs every 15 minutes and checks for stale opportunities
4. For each one that's crossed a reminder threshold (1h / 1d / 3d), it calls `POST /send-reminder`
5. The reminder endpoint sends an email via Resend and marks it as done

If the lead gets updated at any point, `last_activity_at` resets and pending reminders naturally don't fire.

---

## Prerequisites

- Supabase project with PostgreSQL (you already have `DATABASE_URL`)
- Resend account with API key
- Twenty CRM instance with webhook support
- Service deployed and accessible from Supabase (not localhost)

---

## Step 1: Create the Database Table

Go to your **Supabase SQL Editor** and run the contents of:

```
sql/create_opportunities.sql
```

This creates the `opportunities` table with reminder tracking columns and an index for the cron queries.

---

## Step 2: Environment Variables

Add these to your `.env` (and Render dashboard for production):

```env
# Already set
DATABASE_URL=postgresql://...
RESEND_API_KEY=re_...

# Optional - defaults to onboarding@resend.dev for testing
RESEND_FROM=notifications@wareongo.com
```

---

## Step 3: Deploy the Service

Deploy as usual to Render. The new endpoints are:

| Endpoint | Purpose |
|---|---|
| `POST /webhook/twenty` | Receives CRM updates (urlencoded) |
| `POST /send-reminder` | Called by pg_cron to send emails |

No changes needed to build/start commands.

---

## Step 4: Configure Twenty CRM Webhook

In Twenty CRM, create a webhook with these settings:

| Setting | Value |
|---|---|
| URL | `https://twenty-automations.onrender.com/webhook/twenty` |
| HTTP Method | POST |
| Content-Type | `application/x-www-form-urlencoded` |

**Body fields to include:**

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

The webhook should fire on both **create** and **update** events for opportunities.

---

## Step 5: Set Up pg_cron

Go to your **Supabase SQL Editor** and run the contents of:

```
sql/pg_cron_reminders.sql
```

**Before running**, update the URL in the SQL file to match your deployed service URL. The default is `https://twenty-automations.onrender.com/send-reminder`.

This creates 3 cron jobs (all run every 15 minutes):
- `reminder-1h` — nudge after 1 hour of inactivity
- `reminder-1d` — nudge after 1 day of inactivity
- `reminder-3d` — final nudge after 3 days of inactivity

### Enable required extensions

If not already enabled, go to **Supabase Dashboard > Database > Extensions** and enable:
- `pg_cron`
- `pg_net`

---

## Step 6: Verify Everything Works

### Test the webhook

```bash
curl -X POST https://twenty-automations.onrender.com/webhook/twenty \
  -d "id=test-001&stage=RFQ_RECEIVED&assigned_to=Dhaval&deal_name=Test Deal&company=Acme Corp"
```

Expected: `{"received":true}` and a row in the `opportunities` table.

### Test the reminder endpoint

```bash
curl -X POST https://twenty-automations.onrender.com/send-reminder \
  -H "Content-Type: application/json" \
  -d '{"opportunityId":"test-001","assigneeEmail":"dhaval@wareongo.com","step":"1h"}'
```

Expected: `{"sent":true}` and an email delivered. The `reminder_1h_sent` column should now be `true`.

### Check pg_cron is running

In Supabase SQL Editor:

```sql
SELECT * FROM cron.job;
```

You should see 3 jobs: `reminder-1h`, `reminder-1d`, `reminder-3d`.

---

## How Assignee Emails Work

The system derives email addresses from the `assigned_to` field:

```
assigned_to = "Dhaval"    → dhaval@wareongo.com
assigned_to = "John Doe"  → johndoe@wareongo.com
```

Rule: strip spaces, lowercase, append `@wareongo.com`.

---

## Monitoring Failed Reminders

Failed reminders store the error message in the database. Query them:

```sql
SELECT opportunity_id, assignee_email, stage,
       reminder_1h_failed, reminder_1d_failed, reminder_3d_failed
FROM opportunities
WHERE reminder_1h_failed IS NOT NULL
   OR reminder_1d_failed IS NOT NULL
   OR reminder_3d_failed IS NOT NULL;
```

Common failure reasons:
- `Resend API error` — check your `RESEND_API_KEY`
- `validation_error` — invalid email address
- `rate_limit_exceeded` — hit Resend free tier limit (100/day)

---

## Removing pg_cron Jobs

If you need to disable reminders:

```sql
SELECT cron.unschedule('reminder-1h');
SELECT cron.unschedule('reminder-1d');
SELECT cron.unschedule('reminder-3d');
```
