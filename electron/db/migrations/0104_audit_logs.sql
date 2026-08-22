-- ---------------------------------------------------------------------------
-- 0104_audit_logs.sql             (LOCAL SHOP DATABASE — SQLite)
--
-- Feature: Stage 1 — offline sign-ins are recorded locally and uploaded later.
--
-- The offline sign-in row carries an id derived from terminal + person +
-- minute, so a retry upserts onto the same row rather than logging twice. That
-- needs the id to be unique and the descriptive columns to exist.
--
-- Run each ALTER only when PRAGMA table_info(audit_logs) lacks that column.
-- Required on every existing installation. Not applied automatically.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_logs (
  id         TEXT PRIMARY KEY,
  created_at TEXT
);

ALTER TABLE audit_logs ADD COLUMN user_name       TEXT;
ALTER TABLE audit_logs ADD COLUMN action_category TEXT;
ALTER TABLE audit_logs ADD COLUMN action_name     TEXT;
ALTER TABLE audit_logs ADD COLUMN target_module   TEXT;
ALTER TABLE audit_logs ADD COLUMN details         TEXT;
ALTER TABLE audit_logs ADD COLUMN store_id        TEXT;
ALTER TABLE audit_logs ADD COLUMN is_synced       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE audit_logs ADD COLUMN sync_status     TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE audit_logs ADD COLUMN updated_at      TEXT;

CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_pending_idx ON audit_logs (is_synced);

-- ---------------------------------- DOWN ----------------------------------
-- Rebuild the table with (id, created_at); SQLite cannot reliably DROP COLUMN
-- on older engines. See 0101_app_users.sql for the pattern.
-- ---------------------------------------------------------------------------
