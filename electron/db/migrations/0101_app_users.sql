-- ---------------------------------------------------------------------------
-- 0101_app_users.sql              (LOCAL SHOP DATABASE — SQLite)
--
-- Feature: Stage 1 — offline cashier sign-in.
--
-- Adds the columns the offline login writes and reads: the locally computed
-- PBKDF2 verifier (pin_hash), PIN length, last sign-in stamp, role slug,
-- permission blob, branch, and the sync bookkeeping columns. Every column is
-- nullable or defaulted, so existing rows survive untouched.
--
-- SQLite has no "ADD COLUMN IF NOT EXISTS": run each ALTER only when
-- PRAGMA table_info(app_users) does not already list the column. A duplicate
-- ALTER fails with "duplicate column name" and is safe to ignore.
--
-- Required on every existing installation. Not applied automatically.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_users (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  full_name     TEXT,
  email         TEXT,
  role          TEXT,
  created_at    TEXT
);

ALTER TABLE app_users ADD COLUMN role_slug     TEXT;
ALTER TABLE app_users ADD COLUMN store_id      TEXT;
ALTER TABLE app_users ADD COLUMN is_active     INTEGER NOT NULL DEFAULT 1;
ALTER TABLE app_users ADD COLUMN permissions   TEXT NOT NULL DEFAULT '{}';
ALTER TABLE app_users ADD COLUMN pin_hash      TEXT;
ALTER TABLE app_users ADD COLUMN pin_length    INTEGER;
ALTER TABLE app_users ADD COLUMN last_login_at TEXT;
ALTER TABLE app_users ADD COLUMN is_synced     INTEGER NOT NULL DEFAULT 1;
ALTER TABLE app_users ADD COLUMN sync_status   TEXT NOT NULL DEFAULT 'synced';
ALTER TABLE app_users ADD COLUMN row_version   INTEGER NOT NULL DEFAULT 1;
ALTER TABLE app_users ADD COLUMN updated_at    TEXT;

-- The roster upsert conflicts on user_id, so it must be unique. If this fails
-- with "UNIQUE constraint failed", remove the older duplicate rows first:
--   DELETE FROM app_users WHERE id NOT IN (
--     SELECT id FROM app_users GROUP BY lower(user_id)
--     HAVING max(coalesce(updated_at, created_at, '')) = coalesce(updated_at, created_at, ''));
CREATE UNIQUE INDEX IF NOT EXISTS app_users_user_id_idx ON app_users (user_id);

-- ---------------------------------- DOWN ----------------------------------
-- Older SQLite builds cannot DROP COLUMN. Rollback is a table rebuild:
--   CREATE TABLE app_users_old AS SELECT id, user_id, full_name, email, role,
--     created_at FROM app_users;
--   DROP TABLE app_users;
--   ALTER TABLE app_users_old RENAME TO app_users;
-- ---------------------------------------------------------------------------
