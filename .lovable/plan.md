# One canonical central database SQL file

## Goal

Keep all historical migration files, but leave only one SQL file for a person to run manually against the central PostgreSQL database. That file must support both:

- a completely new/empty database; and
- an existing database that may have missing tables, missing columns, or compatible columns created with an older/wrong type.

No application data will be dropped or tables recreated.

## Confirmed cause of the reported error

The current managed database defines `stock_transfer_items.quantity`, `quantity_received`, `quantity_dispatched`, and `quantity_verified` as integers. The canonical script also expects integers, but it only uses `ADD COLUMN IF NOT EXISTS`; therefore it does not repair a column that already exists as text in another database.

That drift makes this statement fail with `42804` because PostgreSQL cannot combine text and integer values in one `COALESCE`:

```sql
COALESCE(i.quantity_received, i.quantity_dispatched, i.quantity)
```

## Changes

### 1. Preserve migration history

- Keep every file under `supabase/migrations/` unchanged as the historical record.
- Add one new corrective migration for the transfer quantity type repair and any final schema corrections required by the consolidated script.
- Apply that migration through the database migration workflow.

### 2. Leave one manually runnable central SQL file

- Keep `supabase/schema.sql` as the only manual central-database installer/upgrader.
- Build its definitions from the complete migration history and current managed database structure.
- Remove the obsolete hand-run files under `supabase/sql/stage5/` after moving any still-used functionality into the canonical file.
- Keep the local Windows SQL Server and SQLite files untouched; they target different databases.

### 3. Make existing-database upgrades safe

Before routines or data backfills run, the canonical file will:

- create missing tables with complete defaults and nullability;
- add every missing column;
- inspect important existing columns whose historical types have varied;
- convert compatible text quantity values to integers before the transfer backfill;
- stop with a precise table/column/value warning if an incompatible value cannot be converted, rather than deleting or silently corrupting it;
- normalize defaults and nullability only after existing values are safe;
- add missing constraints, foreign keys, indexes, grants, row-level security, policies, triggers, views, and routines idempotently;
- handle changed function return signatures before recreating those functions;
- finish with a verification result listing any remaining mismatch.

The transfer repair will ensure all operands are integer-compatible before updating `quantity_verified`, eliminating the reported `COALESCE` error.

### 4. Remove stale references

- Change the in-app deep inventory repair download to use the canonical script instead of the deleted stage file.
- Replace messages that name old files such as `99_run_all.sql`, `35_activity_and_token_columns.sql`, and `99_fix_grants_and_helpers.sql` with `supabase/schema.sql`.
- Update the central SQL README so it clearly says migrations are retained for history and only `supabase/schema.sql` should be run manually.

### 5. Verify both supported paths

- Run the canonical file against a fresh scratch PostgreSQL database.
- Run it twice to prove reruns are safe.
- Reproduce an older database with transfer quantity fields stored as text, then verify the upgrade converts valid values and completes the historical transfer update.
- Verify invalid text is reported without dropping rows.
- Run schema/configuration tests and bump the application version.

## Safety boundary

This work will not drop tables, drop columns, truncate data, reset the database, or delete migration history. Automatic conversion is limited to values that can be represented safely in the authoritative type; incompatible data causes a clear stop for manual review.
