-- ---------------------------------------------------------------------------
-- 0103_staff_roles.sql            (LOCAL SHOP DATABASE — SQLite)
--
-- Feature: Stage 1 — permissions during an offline sign-in.
--
-- Without a mirrored role table the till has no permissions to apply after an
-- offline sign-in. Creates the table when missing and tops up the columns the
-- permission resolver reads.
--
-- Run each ALTER only when PRAGMA table_info(staff_roles) lacks that column.
-- Required on every existing installation. Not applied automatically.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS staff_roles (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  base_level  TEXT,
  permissions TEXT NOT NULL DEFAULT '{}',
  is_core     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT,
  updated_at  TEXT
);

ALTER TABLE staff_roles ADD COLUMN base_level  TEXT;
ALTER TABLE staff_roles ADD COLUMN permissions TEXT NOT NULL DEFAULT '{}';
ALTER TABLE staff_roles ADD COLUMN is_core     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE staff_roles ADD COLUMN created_at  TEXT;
ALTER TABLE staff_roles ADD COLUMN updated_at  TEXT;

-- ---------------------------------- DOWN ----------------------------------
-- DROP TABLE staff_roles;   -- only if this file created it
-- ---------------------------------------------------------------------------
