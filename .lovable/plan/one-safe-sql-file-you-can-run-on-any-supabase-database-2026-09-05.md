# One safe SQL file you can run on any Supabase database

## What I checked

The project already has a full cloud script at `supabase/schema.sql`, but it has fallen
behind. Compared with the live database it is missing:

- 13 tables: `authorization_requests`, `authorization_actions`, `authorization_log`,
  `record_edits`, `entity_status_history`, `nav_pins`, `pos_store_settings`,
  `settings_scoped`, `stock_count_drafts`, `shift_cash_counts`, `shift_close_events`,
  `shift_reconciliations`, `shift_variance_alerts`
- 2 reporting views the app reads: `v_daily_store_sales`, `v_daily_item_sales`
- 11 routines the app calls: booking collect/cancel/refund/balance, `shift_state`,
  `stock_apply_deltas`, `stock_reconcile`, transfer dispatch/approve/verify,
  `product_delete_guard`

That is why a database created from the file still reports missing tables and columns.

## What I will deliver

### 1. One re-runnable file: `supabase/schema.sql`

Rebuilt from the live database so it is complete, and written so it is safe to run on an
empty project *and* on a database that already holds data:

- every table as `CREATE TABLE IF NOT EXISTS`
- every column as `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so an older database gains
  what it is missing without losing a single row
- foreign keys, unique keys and indexes added only when absent
- `GRANT` block for every table (`authenticated` for operating tables, `service_role`
  everywhere, `anon` read only on the public claim pages)
- row-level security enabled with each policy created only when it does not already exist
- every routine as `CREATE OR REPLACE ... SECURITY DEFINER` with a pinned search path
- the two reporting views as `CREATE OR REPLACE VIEW`
- a closing check that lists anything still missing after the run

Nothing is dropped, truncated or recreated at any point.

### 2. One matching migration

The identical SQL is applied to the Lovable-managed database as a single migration, so the
file on disk and the live database stay the same thing.

### 3. Supporting notes

- `supabase/sql/README.md`: how to run the file (paste into the SQL editor of the target
  project, run, read the final check), and that it is safe to re-run.
- The older one-off parity files under `supabase/sql/stage5/` stay where they are; the new
  file already contains everything they do, so they become optional.

## Technical notes

- Table and routine definitions are read from the live database rather than reconstructed
  from the migration history, so column types, defaults and constraints match exactly.
- Policy and index creation is wrapped in `DO $$ ... IF NOT EXISTS (select 1 from
  pg_policies ...)` blocks; `CREATE POLICY` has no `IF NOT EXISTS` form.
- `SET check_function_bodies = off` at the top so routines can be created before the tables
  they read, the same way a restore does.
- Version bumped with `node scripts/bump-version.cjs` at the end.
