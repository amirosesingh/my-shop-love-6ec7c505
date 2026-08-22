# Schema Manager — per-table repair & SQL export inside the POS

## What you asked for

Instead of copying new SQL files to each till, one panel inside the app (visible right after the local database connects) that:

1. Lists **every table with every column** from the master schema, compared live against the connected SQL Server.
2. Lets you **select tables one by one** (or all) and repair just those.
3. **New tables appear automatically** — the list is parsed from the master file at runtime, nothing hard-coded.
4. Lets you **download the SQL** (whole file or a single table) straight from the app — no pen drive.

## What exists today

- `SchemaPanel` already reads and applies `database/schema.sql`, but it is hidden behind "Show technical details", shows table names only (no columns, no live status), and applies all-or-nothing.
- The Electron side (`electron/db/pool.cjs`) already locates the master file, splits it into batches, and applies it idempotently. All statements are guarded (`IF OBJECT_ID… / COL_LENGTH…`), so repairing never drops data.
- Verified: the drift migration's columns (racket service, shift closure, payment idempotency) are already inside `database/schema.sql` — it is the single source.

## Changes

### 1. Electron main process — `electron/db/pool.cjs`
- **Parse the master file into a per-table manifest**: split on `GO`, assign each batch to the table(s) it touches via `dbo.<table>` references; extract expected columns from `CREATE TABLE` blocks and guarded `ALTER TABLE … ADD` statements.
- **`schemaStatus()`**: one query against `sys.tables` / `sys.columns` on the connected database, returning per table: `exists`, `missingColumns[]`, `extraColumns[]`.
- **`applySchemaTables(tables)`**: runs only the batches belonging to the selected tables, then refreshes the repo column cache. Returns a per-table ok/error result so one bad table doesn't hide the rest.
- **`schemaTableSql(tables)`**: returns the exact SQL text for the chosen tables (used for export/copy).

### 2. IPC wiring — `electron/main.cjs`, `electron/preload.cjs`, `src/lib/local-db.ts`
- New handlers `pos:schema-status`, `pos:apply-schema-tables`, `pos:schema-table-sql`, exposed on the localDb bridge with matching TypeScript types.

### 3. UI — rebuild `src/components/database/SchemaPanel.tsx` into a Schema manager
- **Visible placement**: moved out of "Show technical details" into its own section in `LocalDatabaseSettings` (Settings → Sync & backup), right under the connection status. Loads automatically once connected.
- **Table list**: checkbox + table name + live status badge (`OK` / `Missing table` / `N columns missing` / `Extra columns`). Expanding a row shows every column with its type and whether it is present or missing locally.
- **Actions**: "Select all with issues", "Repair selected", "Repair all" (behind a confirm dialog; idempotent, never deletes data).
- **Export**: "Download SQL" for the full master file and per-table "Download table SQL" — saved via the browser download, works on any till.
- Refresh re-runs the live comparison after a repair; failures are reported per table.
- Browser/web tills keep the current "desktop app only" note — unchanged.

### 4. Verification
- Parser sanity check against the real `database/schema.sql` (all ~57 tables parsed, every batch assigned, columns extracted).
- Build/typecheck, plus a quick preview check of the settings page.

## Technical details

- No automatic schema changes on boot — applying stays an explicit operator click, as today.
- The comparison is read-only (`sys.tables`/`sys.columns`); repair uses the same guarded batches the full apply already runs.
- No database migration needed; this is desktop-shell + UI work only.
