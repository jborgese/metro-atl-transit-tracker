-- Migration number: 0001 	 2026-02-20T22:43:14.622Z
-- Initial D1 schema for canonical content writes and immutable history.

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  archived_at TEXT,
  archived_by TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_archive_state
  ON projects (is_archived, updated_at DESC);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  archived_at TEXT,
  archived_by TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_goals_archive_state
  ON goals (is_archived, updated_at DESC);

CREATE TABLE IF NOT EXISTS content_history (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('project', 'goal')),
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'archive', 'restore')),
  actor TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json TEXT CHECK (after_json IS NULL OR json_valid(after_json))
);

CREATE INDEX IF NOT EXISTS idx_content_history_entity
  ON content_history (entity_type, entity_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_content_history_timestamp
  ON content_history (timestamp DESC);

CREATE TRIGGER IF NOT EXISTS trg_content_history_immutable_update
BEFORE UPDATE ON content_history
BEGIN
  SELECT RAISE(ABORT, 'content_history is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_content_history_immutable_delete
BEFORE DELETE ON content_history
BEGIN
  SELECT RAISE(ABORT, 'content_history is immutable');
END;
