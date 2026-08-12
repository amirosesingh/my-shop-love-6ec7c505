# Clean up the console errors on the terminal + activity feed

## What is actually happening

The app is running against your own database project, not the managed one. Two features were added to the managed project only, so your database is missing pieces:

1. `terminal_tokens` has no `is_claimed` / `expires_at` columns. Issuing a code already works, because the code retries after dropping each unknown column — but every retry logs a red 400 in the console. Noise, not breakage.
2. `activity_events` (the notification feed) does not exist at all in your database, so the header bell polls a missing table every 45 seconds and logs a 404 each time.

## Fix

### 1. One SQL file to bring your database up to date
New `supabase/sql/35_activity_and_token_columns.sql`, safe to re-run:
- adds `is_claimed boolean not null default false` and `expires_at timestamptz` to `terminal_tokens` (`ADD COLUMN IF NOT EXISTS`), backfilling `is_claimed` from existing `status = 'used'` rows;
- creates `activity_events` with the same shape as the managed project, plus grants, row protection for supervisors/admins, the append-only trigger and the indexes.

Running it makes both console errors disappear and switches the notification feed on for this database.

### 2. Stop the noise even before the SQL is run
- **Token issuing:** remember, per database, which optional columns are missing (in memory + local storage) after the first rejected attempt, so later codes are inserted with the supported columns on the first try — no repeated 400s. Behaviour and the single-use/expiry features are unchanged where the columns exist.
- **Activity feed:** treat "table not found" as "feature not installed here". The bell stops polling for the session, shows a short "Activity log not set up on this database" note instead of an empty list, and the notifications report shows the same hint with a pointer to run the SQL file. Recording events stays fire-and-forget and keeps queueing locally, exactly as now.

## Technical notes

- Files touched: `src/lib/terminal-tokens.ts` (cache the unsupported-column set, keyed by database URL), `src/lib/activity-events.ts` (detect `PGRST205`/`42P01` and expose a `notInstalled` state), `src/components/pos/ActivityBell.tsx` and `src/routes/reports.notifications.tsx` (render the hint, stop the interval), plus the new SQL file.
- No schema change is made to the managed project; the SQL file is for your own database and is idempotent.
