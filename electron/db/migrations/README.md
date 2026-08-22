# Stage 5 — shop database upgrades (SQLite)

Hand-run files for a till whose SQLite mirror was created by an older build.
`../offline_sqlite_v2.sql` already creates everything here on a fresh install;
these files upgrade an existing one.

**Nothing runs automatically** — the app does not execute this folder.

Run order:

1. `0101_app_users.sql` — offline sign-in columns, unique `user_id` (required)
2. `0102_cashiers.sql` — roster mirror columns, unique `username` (required)
3. `0103_staff_roles.sql` — role/permission mirror (required)
4. `0104_audit_logs.sql` — offline sign-in audit rows (required)
5. `0105_compare_indexes.sql` — indexes for the comparison page (optional)

SQLite has no `ADD COLUMN IF NOT EXISTS`. Before each `ALTER TABLE ... ADD COLUMN`,
check `PRAGMA table_info(<table>)` and skip the line when the column is already
there; a duplicate ALTER fails with `duplicate column name` and can be ignored.

Rollback is described in each file's `-- DOWN` comment. Older SQLite engines
cannot drop a column, so rollback means rebuilding the table — the comment gives
the SQL rather than pretending `DROP COLUMN` works everywhere.
