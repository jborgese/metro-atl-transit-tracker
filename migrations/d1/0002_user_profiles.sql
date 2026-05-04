-- Migration number: 0002 	 2026-05-04T00:00:00.000Z
-- Per-identity display name overrides for actor strings shown on /history,
-- in admin "Recent Changes", and in entity provenance ("Updated by ...").
-- Resolved at read time; content_history rows remain immutable.

CREATE TABLE IF NOT EXISTS user_profiles (
  identity TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_display_name
  ON user_profiles (display_name);
