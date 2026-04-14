-- Run this in the Supabase SQL Editor
-- Requires pg_cron and pg_net extensions (enable via Supabase dashboard)

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Replace with your deployed service URL
\set service_url 'https://twenty-automations.onrender.com/send-reminder'

-- 1 hour reminder
SELECT cron.schedule('reminder-1h', '*/15 * * * *', $$
  SELECT net.http_post(
    url := 'https://twenty-automations.onrender.com/send-reminder',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := row_to_json(r)::jsonb
  )
  FROM (
    SELECT opportunity_id AS "opportunityId",
           assignee_email AS "assigneeEmail",
           '1h' AS step
    FROM opportunities
    WHERE stage = 'RFQ_RECEIVED'
      AND reminder_1h_sent = false
      AND reminder_1h_failed IS NULL
      AND last_activity_at < now() - interval '1 hour'
  ) r;
$$);

-- 1 day reminder
SELECT cron.schedule('reminder-1d', '*/15 * * * *', $$
  SELECT net.http_post(
    url := 'https://twenty-automations.onrender.com/send-reminder',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := row_to_json(r)::jsonb
  )
  FROM (
    SELECT opportunity_id AS "opportunityId",
           assignee_email AS "assigneeEmail",
           '1d' AS step
    FROM opportunities
    WHERE stage = 'RFQ_RECEIVED'
      AND reminder_1d_sent = false
      AND reminder_1d_failed IS NULL
      AND last_activity_at < now() - interval '1 day'
  ) r;
$$);

-- 3 day reminder
SELECT cron.schedule('reminder-3d', '*/15 * * * *', $$
  SELECT net.http_post(
    url := 'https://twenty-automations.onrender.com/send-reminder',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := row_to_json(r)::jsonb
  )
  FROM (
    SELECT opportunity_id AS "opportunityId",
           assignee_email AS "assigneeEmail",
           '3d' AS step
    FROM opportunities
    WHERE stage = 'RFQ_RECEIVED'
      AND reminder_3d_sent = false
      AND reminder_3d_failed IS NULL
      AND last_activity_at < now() - interval '3 days'
  ) r;
$$);

-- View failed reminders
-- SELECT opportunity_id, assignee_email, stage,
--        reminder_1h_failed, reminder_1d_failed, reminder_3d_failed
-- FROM opportunities
-- WHERE reminder_1h_failed = true
--    OR reminder_1d_failed = true
--    OR reminder_3d_failed = true;
