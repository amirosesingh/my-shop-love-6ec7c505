# Fix payment_transactions sync + self-healing schema (local & cloud)

## What you reported

1. **Cash sale syncs with an error on `payment_transactions`** — you can't tell whether it fails offline (local SQL Server) or online (central database).
2. **Missing tables/columns should fix themselves** — if a table is missing, create it; if a column is missing, add it; on every operation (insert / update / delete), dynamically.
3. **If Windows/SQL admin permission is needed, the app should ask** — not just fail with a raw permission error.

## Root causes found in code

- **Payment rows carry no idempotency key.** `salePaymentRows` (`src/lib/pos-db.ts`) never sets `client_transaction_id` on `payment_transactions` rows, unlike sales/sale_items. If a push half-fails and retries with regenerated ids, the central database can reject it with a duplicate-key error — the exact "payment_transaction sync error" symptom.
- **No self-heal in the local engine.** `electron/db/repo.cjs` crashes with `Invalid object name` when a table is missing (the column lookup silently returns empty and the write then fails), and silently *drops* values for columns the local table doesn't have yet. Nothing ever runs a guarded `CREATE`/`ALTER` on demand.
- **Cloud drift is invisible.** If your own central project is missing a newer table/column, the sync worker retries the same failing batch every 30s forever; the only trace is a parked row.
- **Permission failures are dead ends.** When the SQL login can't run CREATE/ALTER, the app shows a raw error instead of asking for an admin login.

## Changes

### 1. Make payment push idempotent — `src/lib/pos-db.ts`, `src/lib/pos-relay.server.ts`
- `salePaymentRows` stamps every tender row with `client_transaction_id = <sale attempt id>:pay:<n>` (the column already exists in both schemas, so old and new databases both accept it).
- Relay: if a `payment_transactions` upsert is rejected with a duplicate-key error, look the row up by `client_transaction_id`; if it is already stored centrally, report success instead of failing the sale's sync.

### 2. Local self-healing engine — `electron/db/pool.cjs`, `electron/db/repo.cjs`
- `pool.cjs`: new `ensureSchemaTable(table)` — runs just that table's guarded batches from the master `database/schema.sql` (same idempotent statements the Schema manager uses, never drops data), with a per-table in-flight lock so the sync worker and a sale can't double-repair. New `schemaColumnType(table, column)` reads the expected type from the manifest.
- `repo.cjs`: every table operation (insert/upsert/update/delete/read/sync-queue) wrapped in a one-time retry:
  - `Invalid object name` → create the table from the master schema, retry once.
  - `Invalid column name` → if the master schema declares the column, `ALTER TABLE ADD` it (guarded) and retry once; if not declared, keep the current safe drop-and-warn.
  - Writes that currently *silently drop* a schema-known column now add the column and keep the data.
- Net effect: insert / update / delete / sync against a missing table or column just works — the schema repairs itself at the moment it's needed.

### 3. Permission: the app asks for an admin login — `electron/db/admin-pool.cjs`, `electron/main.cjs`, `electron/preload.cjs`, Schema manager UI
- When self-heal or Repair hits a permission error (SQL 262/229), the app shows a dialog: *"Windows/SQL permission needed — sign in with a database admin login (e.g. sa) to create the missing tables."*
- The dialog runs the repair through the existing admin connection pool with those credentials, then continues as the normal login. No PC-level changes, no manual SSMS session.
- If the admin login also fails, the exact grant needed is shown (`db_ddladmin` on the POS database).

### 4. Cloud schema check & graceful degradation — relay + sync worker + Sync Hub
- New relay read: fetch the central database's table/column list (via the service key) and compare with the schema the app expects → a "Central schema" panel listing missing tables/columns, with a **Download SQL** button producing the exact PostgreSQL script to run once in your central project's SQL editor (no pen drive).
- Sync worker: when a push fails because the cloud table/column doesn't exist, park that table's rows with a clear message ("table `payment_transactions` missing in central database — open Settings → Central schema") and skip it in later cycles instead of failing every 30s; it resumes automatically once the table exists.
- The Sync Hub error row keeps the full server message so we can see the real reason if anything still fails.

## Verification
- `node --check` on Electron files, `bunx tsgo` typecheck.
- Node harness with a mocked pool: missing table → created + retried; missing column → added + value written; undeclared column → dropped with warning; permission denied → admin prompt path, no retry loop.
- Parser re-run against `database/schema.sql` to confirm column types resolve for the new columns (`client_transaction_id`, `status`, `metadata`, …).
- Payment idempotency: unit-level check that a re-pushed tender row resolves as already-stored.

## Technical details
- Files: `src/lib/pos-db.ts`, `src/lib/pos-relay.server.ts`, `electron/db/pool.cjs`, `electron/db/repo.cjs`, `electron/db/admin-pool.cjs`, `electron/main.cjs`, `electron/preload.cjs`, `src/lib/local-db.ts`, Schema manager / Sync Hub UI components.
- One honest limit: the central (PostgreSQL) database cannot be altered by the app itself — PostgREST has no DDL. That's why the cloud side gets a check + ready-to-run SQL download, while the local SQL Server side is fully automatic.
- No cloud migration is run by me; the central-project SQL is delivered as a downloadable script for you to execute.
