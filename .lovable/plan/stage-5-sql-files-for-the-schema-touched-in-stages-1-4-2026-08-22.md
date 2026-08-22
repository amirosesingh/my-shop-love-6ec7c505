# Stage 5 — SQL files for the schema touched in Stages 1-4

## What the audit actually found

I diffed every commit from the start of Stage 1 to now. No `.sql` file was
changed in Stages 1-4, and no new table was created. The schema work was:

- **Stage 1 (cashier login)** — offline login reads and writes `app_users`
  (`pin_hash` used as a local PBKDF2 verifier, `pin_length`, `last_login_at`,
  `role_slug`, `permissions`, `store_id`, unique `user_id`), mirrors the roster
  from `cashiers`/`staff_roles`, and queues each offline sign-in as an
  `audit_logs` upsert keyed on `id`.
- **Stage 2 (top bar)** and **Stage 3 (customer display)** — UI and Electron
  lifecycle only, no database involvement.
- **Stage 4 (server vs shop comparison)** — read-only. The shop-side queries are
  column-tolerant (they fall back when `updated_at`, `is_synced` or
  `sync_status` is absent), so nothing is required. What is missing is an index
  on the timestamp column each comparison sorts and filters by.

The current full-install scripts (`electron/db/offline_sqlite_v2.sql`,
`db/offline/pos-offline-sqlserver.sql`) and the cloud database already declare
all of the above — verified against the live cloud columns. The gap is
**existing tills installed from an older build**: they have no upgrade path,
because those files only ever run on a fresh install.

So Stage 5 produces upgrade files, one per table, per engine, that bring an
older install in line and are safe to re-run on an already-correct one.

## Files to create

Nothing is applied to any live database — files only.

### Local (SQL Server, `db/offline/migrations/`)

| File | What it does |
| --- | --- |
| `20260822_0101_app_users.sql` | Add `role_slug`, `pin_hash`, `pin_length`, `last_login_at`, `permissions`, `store_id`, `is_synced`, `sync_status`, `row_version`, `updated_at` if absent; unique index on `user_id` after de-duplicating |
| `20260822_0102_cashiers.sql` | Add `role_slug`, `permissions`, `last_login_at`, sync flags if absent; unique index on `username` |
| `20260822_0103_staff_roles.sql` | Create the table if absent; add `permissions`, `is_core`, timestamps |
| `20260822_0104_audit_logs.sql` | Ensure `action_category`, `action_name`, `target_module`, `details`, `user_name`; `id` as the upsert key so a replayed offline sign-in updates instead of duplicating |
| `20260822_0105_compare_indexes.sql` | Index on `updated_at` (falling back to `created_at`) for the tables the comparison page reads |

Every statement is guarded with `IF COL_LENGTH(...) IS NULL` /
`IF OBJECT_ID(...) IS NULL`, matching the style already used in
`pos-offline-sqlserver.sql`. Each file ends with a commented-out `-- DOWN`
block (SQL Server supports `ALTER TABLE ... DROP COLUMN`, so the rollback is
real, just not executed by default).

### Local (SQLite, `electron/db/migrations/`)

Same five tables, SQLite syntax: `ALTER TABLE ... ADD COLUMN` one column at a
time, guarded by the runner reading `PRAGMA table_info` first (SQLite has no
`ADD COLUMN IF NOT EXISTS`). Files:
`0101_app_users.sql`, `0102_cashiers.sql`, `0103_staff_roles.sql`,
`0104_audit_logs.sql`, `0105_compare_indexes.sql`.

SQLite cannot drop a column on older engines, so the `-- DOWN` header states
plainly that rollback is a table rebuild and gives the rebuild SQL in a comment
rather than pretending a `DROP COLUMN` works everywhere.

Each SQLite file adds only columns that are nullable or carry a default, so
existing rows keep working.

### Server (PostgreSQL, `supabase/sql/stage5/`)

The cloud database already has every column Stages 1-4 use, so these files are
verification/parity files for a self-hosted central server built from an older
script — not changes to the managed cloud database:

- `20260822010000_app_users.sql` — `role_slug`, `pin_length`, `row_version`,
  unique `user_id`, all `if not exists`
- `20260822010100_audit_logs.sql` — offline sign-in columns and the `id`
  primary key used for conflict-free replay
- `20260822010200_staff_roles.sql` — table + grants + RLS parity
- `20260822010300_compare_indexes.sql` — `updated_at` indexes for the
  comparison endpoint

Sequenced after the newest existing migration, `20260821035305_*.sql`, so no
version is skipped or reused. These live under `supabase/sql/` rather than
`supabase/migrations/` precisely so they are not auto-applied.

Each file opens with a header comment: what it does, which stage/feature it
supports, and whether it is required or parity-only.

## At the end

A short `README.md` in each of the three folders: run order, which engine, and
the statement that none of it runs automatically.

## Technical notes

- No application code changes in this stage, and no version bump beyond the
  current 1.3.26 unless you want one.
- The SQLite runner in `electron/db/sqlite.cjs` is not wired to these files in
  this stage — they are hand-run upgrade scripts. Say the word if you want the
  runner to apply them on startup instead.
