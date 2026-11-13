-- Migration number: 0004 	 2026-11-13
-- Timed actions table, and a content_history rebuild that drops the entity_type CHECK.
-- Statement order matters: see docs/specs/2026-11-timed-actions.md section 4.3.1.

CREATE TABLE IF NOT EXISTS timed_actions (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  archived_at TEXT,
  archived_by TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  CHECK (json_type(payload_json, '$.expires_on') IS 'text')
);

CREATE INDEX IF NOT EXISTS idx_timed_actions_archive_state
  ON timed_actions (is_archived, updated_at DESC);

ALTER TABLE content_history RENAME TO content_history_old;

CREATE TABLE content_history (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'archive', 'restore')),
  actor TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json TEXT CHECK (after_json IS NULL OR json_valid(after_json))
);

INSERT INTO content_history
  SELECT id, entity_type, entity_id, action, actor, timestamp, before_json, after_json
  FROM content_history_old ORDER BY rowid;

DROP TABLE content_history_old;

-- DROP TABLE removed the old indexes and triggers; recreate them as in 0001.
CREATE INDEX idx_content_history_entity
  ON content_history (entity_type, entity_id, timestamp DESC);

CREATE INDEX idx_content_history_timestamp
  ON content_history (timestamp DESC);

CREATE TRIGGER trg_content_history_immutable_update
BEFORE UPDATE ON content_history
BEGIN
  SELECT RAISE(ABORT, 'content_history is immutable');
END;

CREATE TRIGGER trg_content_history_immutable_delete
BEFORE DELETE ON content_history
BEGIN
  SELECT RAISE(ABORT, 'content_history is immutable');
END;
