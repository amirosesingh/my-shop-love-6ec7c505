# Repair parked sync rows and make schema upgrades repeatable

## Confirmed diagnosis

- `payment_transactions` and `item_activity_logs` are present in the local SQL Server schema, repository sync list, branch policy, and conflict-key configuration.
- They are omitted from `RELAY_TABLES` in `src/lib/pos-relay.server.ts`. The central relay therefore returns `"<table>" cannot be synced` before authorization or database writes run.
- Electron treats that rejection as a normal repeated failure. After five attempts, `electron/sync/worker.cjs` and `electron/db/repo.cjs` mark the rows `quarantined`/parked.
- `database/schema.sql` is the master **Microsoft SQL Server** schema used by the in-app Schema Manager. It is already mostly guarded, but its parser and generated exports need validation and clearer engine-specific guidance.
- The central Schema card currently creates **PostgreSQL** repair SQL only. It does not apply DDL automatically, and its missing-table output does not include complete row-security policies, so central repairs must remain reviewed/downloaded SQL rather than one-click execution from a till.

## Implementation

### 1. Unblock the two sync tables

- Edit `src/lib/pos-relay.server.ts`:
  - Add `payment_transactions` and `item_activity_logs` to the relay write allow-list.
  - Preserve the existing store scoping, conflict keys, payment idempotency handling, and stock-delta processing.
- Add regression coverage under `src/lib/__tests__/` proving every configured sync/conflict table is accepted by the relay allow-list and still passes authorization checks.
- Improve the worker classification in `electron/sync/worker.cjs` so an unsupported-table configuration error is reported distinctly instead of being mistaken for transient row failure.

### 2. Recover rows that are already parked

- Keep existing rows unchanged and use the existing retry mechanism in `electron/db/repo.cjs` after the corrected app version is installed.
- Update the Sync Hub wording/action so affected `error` or `quarantined` rows can be re-queued without deleting or recreating the sale.
- Verify retries preserve the original `id` and `client_transaction_id`, preventing duplicate payments, duplicate item logs, or duplicate stock deductions.

### 3. Harden the local SQL Server master schema

- Audit and tighten `database/schema.sql` so every table, column, index, trigger, and repair step is repeatable:
  - Missing table: guarded `IF OBJECT_ID(...) IS NULL` creation.
  - Existing table with missing column: guarded `IF COL_LENGTH(...) IS NULL` addition.
  - Indexes/triggers/constraints: existence checks before creation or replacement.
  - Preserve data; no table drops, truncation, or destructive column rewrites.
- Ensure the full definitions and top-up blocks for `payment_transactions` and `item_activity_logs` include all sync fields required by the repository and worker.
- Strengthen the parser/validation in `electron/db/pool.cjs` so unsupported column types or unassigned batches are reported instead of silently omitted.
- Add a schema sanity test that parses the real master file and verifies all expected tables/columns and guarded batches.

### 4. Keep SQLite parity

- Update `electron/db/offline_sqlite_v2.sql` for these two tables so the embedded fallback has the same sync bookkeeping and idempotency fields as SQL Server.
- Use SQLite-safe, repeatable migration logic in `electron/db/sqlite.cjs`; do not place Microsoft SQL Server syntax in the SQLite file.

### 5. Make “which SQL runs where” explicit in the Schema Manager

- Edit `src/components/database/SchemaPanel.tsx`:
  - Rename the local actions to **Local SQL Server — Repair selected** and **Download local SQL Server script**.
  - Label the central action **Download central PostgreSQL repair script**.
  - Show short run guidance beside each download.
- Keep central repair as the selected safe-SQL workflow:
  - Missing columns use additive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
  - Missing-table output must not present an incomplete table without security as production-ready. It will include a clear guarded structure plus required grants/RLS guidance sourced from the authoritative central schema, or block unsafe incomplete generation and point to the complete central schema section.
  - No service key or publishable key will be used to execute arbitrary DDL from a till.
- Correct stale schema guidance in `src/lib/schema-guard.ts` so it names the files/actions that actually exist.
- Update `db/offline/README.md` with the same two-database instructions.

## Where each SQL file runs

### Local shop/till database

- Engine: **Microsoft SQL Server**, not MySQL and not PostgreSQL.
- Preferred method: POS → Settings → Database & Cloud Connection → Schema Manager → Local SQL Server.
- Manual method: run `database/schema.sql` in SQL Server Management Studio against the till’s POS database.
- Syntax includes `dbo`, `NVARCHAR`, `IF OBJECT_ID`, `COL_LENGTH`, and `GO`; it must never be run in the central PostgreSQL editor.

### Central online database

- Engine: **PostgreSQL** in the external central database project.
- Use the Schema Manager’s **Download central PostgreSQL repair script**, then run that downloaded file in the external project’s SQL editor.
- Syntax includes `public.<table>`, `CREATE TABLE IF NOT EXISTS`, and `ADD COLUMN IF NOT EXISTS`; it must never be run in SQL Server Management Studio.

## Verification

- Relay tests for both tables, including duplicate retry/idempotency behavior.
- Master-schema parser test and guarded-statement checks.
- Confirm a previously parked payment and item log can be re-queued, sync once, and become `synced` without duplicating stock movement.
- Confirm local and central downloads are clearly named and contain only their own database engine’s syntax.
- Run targeted tests and bump the application version with the project’s version script.

No live central schema migration will be applied automatically; the result is reviewed, downloadable PostgreSQL SQL as requested.
