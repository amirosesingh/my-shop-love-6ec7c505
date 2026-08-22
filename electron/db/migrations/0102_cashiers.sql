-- ---------------------------------------------------------------------------
-- 0102_cashiers.sql               (LOCAL SHOP DATABASE — SQLite)
--
-- Feature: Stage 1 — offline cashier sign-in (roster mirror).
--
-- The legacy cashier roster mirrored from head office. Adds role slug,
-- permission blob, active flag, last sign-in stamp and sync bookkeeping, and
-- makes the username unique so a replayed pull updates instead of duplicating.
--
-- Run each ALTER only when PRAGMA table_info(cashiers) lacks that column.
-- Required on every existing installation. Not applied automatically.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cashiers (
  id         TEXT PRIMARY KEY,
  username   TEXT NOT NULL,
  full_name  TEXT,
  pin_hash   TEXT,
  store_id   TEXT,
  created_at TEXT
);

ALTER TABLE cashiers ADD COLUMN role_slug     TEXT;
ALTER TABLE cashiers ADD COLUMN permissions   TEXT NOT NULL DEFAULT '{}';
ALTER TABLE cashiers ADD COLUMN is_active     INTEGER NOT NULL DEFAULT 1;
ALTER TABLE cashiers ADD COLUMN last_login_at TEXT;
ALTER TABLE cashiers ADD COLUMN is_synced     INTEGER NOT NULL DEFAULT 1;
ALTER TABLE cashiers ADD COLUMN sync_status   TEXT NOT NULL DEFAULT 'synced';
ALTER TABLE cashiers ADD COLUMN updated_at    TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS cashiers_username_idx ON cashiers (username);

-- ---------------------------------- DOWN ----------------------------------
-- Rebuild the table with the original six columns; SQLite cannot reliably
-- DROP COLUMN on older engines. See 0101_app_users.sql for the pattern.
-- ---------------------------------------------------------------------------
