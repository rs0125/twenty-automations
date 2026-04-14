-- Run this in Supabase SQL Editor to create the opportunities table

CREATE TABLE IF NOT EXISTS opportunities (
  opportunity_id       TEXT PRIMARY KEY,
  data                 JSONB NOT NULL,
  stage                TEXT,
  assignee_email       TEXT,
  last_activity_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  reminder_1h_sent     BOOLEAN NOT NULL DEFAULT false,
  reminder_1d_sent     BOOLEAN NOT NULL DEFAULT false,
  reminder_3d_sent     BOOLEAN NOT NULL DEFAULT false,

  reminder_1h_failed   TEXT,
  reminder_1d_failed   TEXT,
  reminder_3d_failed   TEXT
);

-- Index for the cron query: stage + not-sent + last_activity_at
CREATE INDEX IF NOT EXISTS idx_opportunities_reminder_check
  ON opportunities (stage, last_activity_at)
  WHERE reminder_1h_sent = false OR reminder_1d_sent = false OR reminder_3d_sent = false;
