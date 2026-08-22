# Self-healing local schema — auto-create missing tables & columns

## What you asked for

Cash sales now save cleanly. The remaining pain: when the till touches a table or column that does not exist yet in the local SQL Server (new products tables, recently added columns), the operation fails with "table doesn't exist" / "permission denied" instead of fixing itself. You want the engine to **create the table if it is missing and add the column if it is missing — dynamically, at the moment it is needed**.

## Root cause (confirmed in code)

- `electron/db/repo.cjs` `tableColumns()` queries `INFORMATION_SCHEMA.COLUMNS`; for a **missing table it silently returns an empty set**, and the write then crashes with `Invalid object name 'dbo.<table>'` (SQL error 208). No recovery exists anywhere in repo.cjs.
- For a **missing column**, the write path silently *drops* the value (`known.has(c)` filter in `upsertRow`) — the sale succeeds but data is lost — or, on read/push paths, fails with `Invalid column name` (error 207). Nothing attempts an `ALTER TABLE ADD`.
- The Schema manager (`pool.cjs`) already has everything needed to repair — the parsed manifest of `database/schema.sql` and guarded, idempotent batches — but it only runs when you click Repair manually.

## Changes

### 1. `electron/db/pool.cjs` — expose single-table repair for the engine
- Cache the parsed manifest (re-parse only if the file's mtime changes).
- New exported `ensureSchemaTable(table)`:
  - Runs exactly that table's guarded batches from the master schema (same idempotent path as the Schema manager's "Repair selected", shared engine rules included).
  - An **in-flight lock per table** so a sale and the sync worker hitting the same missing table at once trigger one repair, not two.
  - Returns `{ ok, created, error }`; on a permission failure (SQL 262/229) the error text tells the operator precisely what to grant: `db_ddladmin` on the POS database (or sign in with a login that has it, then use Schema manager → Repair).
- New exported `schemaColumnType(table, column)` → the SQL type string from the manifest, or `null` when the master schema does not declare that column.

### 2. `electron/db/repo.cjs` — self-healing on every read/write
- **Missing table**: `tableColumns()` returns an empty set → call `ensureSchemaTable(table)`, clear the column cache, re-read once. Still empty → throw a plain-language error naming the table.
- **Retry wrapper** `withSchemaRetry(table, fn)` around every table-touching operation (`upsertRow`, `updateRows`, `deleteRows`, `pendingRows`, `markSynced`, `markFailed`, `mergeFromCloud`, `rows`, `getProducts`, watermark/state helpers):
  - Catch `Invalid object name` (208) → `ensureSchemaTable(table)` + retry the operation **once**.
  - Catch `Invalid column name '<col>'` (207) → if the master schema declares that column, run the guarded `ALTER TABLE dbo.[table] ADD [<col>] <type>`; refresh cache; retry once. If the master schema doesn't declare it → rethrow the original error (no guessing column types).
- **Missing column on write**: in `upsertRow`, columns currently dropped because the local table lacks them are first checked against the manifest — if the master schema declares them, the column is added (guarded `ALTER`) and the value is written instead of dropped. Columns the master schema does not know keep the current drop-and-warn behaviour (this is the drift protection that keeps cloud pushes safe — unchanged).
- A repair that fails on permission throws one clear message: *"The login '<x>' cannot create/alter tables in '<db>'. Grant it db_ddladmin, or open Settings → Sync & backup → Schema manager and press Repair with an admin login."*

### 3. Sync worker (`electron/sync/worker.cjs`)
- No logic change needed — it goes through `repo.cjs`, so pulls/pushes inherit the self-heal. Verified while editing.

### 4. What stays the same
- Applying schema on boot: still never automatic — self-heal only triggers when an operation actually touches the missing object, and only runs the already-guarded statements from `database/schema.sql` (never drops data).
- Schema manager UI, cloud push column whitelist, and all sync semantics unchanged.

### 5. Verification
- `node --check` on both Electron files; `bunx tsgo` typecheck.
- A small Node harness with a mocked pool asserting: missing table → ensure + retry succeeds; missing column declared in schema → ALTER issued + value written; undeclared column → dropped with warning; permission denied → clear grant hint, no retry loop.
- Parser re-run against the real `database/schema.sql` to confirm `schemaColumnType` resolves types for the recently added columns (`tension_main`, `client_transaction_id`, etc.).

## Technical details

- Files touched: `electron/db/pool.cjs`, `electron/db/repo.cjs` only (plus the throwaway test harness, not shipped). No UI, no migrations, no cloud changes.
- Self-heal DDL is the same guarded `IF OBJECT_ID… / COL_LENGTH…` batches already used by the Schema manager — idempotent and safe to run mid-sale.
- One honest limitation: if the SQL login has no DDL rights, the database itself will refuse CREATE/ALTER no matter what the app does — in that case the till shows the exact grant needed instead of a raw error.
