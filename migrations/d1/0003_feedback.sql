-- Migration number: 0003 	 2026-06-11T00:00:00.000Z
-- Visitor feedback submissions. The row is the canonical record; email
-- delivery to the site owner is best-effort (email_sent flags degraded
-- deliveries so they can be found later).

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  name TEXT,
  email TEXT,
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('general', 'bug', 'data-correction', 'feature-request')),
  page_url TEXT,
  client_key TEXT,
  email_sent INTEGER NOT NULL DEFAULT 0 CHECK (email_sent IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at
  ON feedback (created_at DESC);
