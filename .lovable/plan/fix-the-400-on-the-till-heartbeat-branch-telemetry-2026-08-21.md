# Fix the 400 on the till heartbeat (branch_telemetry)

## What is happening

The till posts its heartbeat to `branch_telemetry` in **your own** database
(`qhrufhtbeguxydenzfey`), not the Cloud backend. That request is rejected with 400 because
the heartbeat sends columns the table there does not have:
`device_name`, `device_type`, `location_name`, `session_status`, `last_heartbeat_at`.

Those columns exist in the app's schema files
(`supabase/migrations/20260820042325_*.sql` and `20260821035305_*.sql`), but those files
have never been run against `qhrufhtbeguxydenzfey`. I have no write access to that project,
so the schema must be applied by you — and separately, the app should stop breaking when a
till points at a database that is a version behind.

## Plan

### 1. Give you the exact SQL to run on your project (no code change)

Provide a single copy-paste script (idempotent, safe to re-run) that adds the five missing
columns to `branch_telemetry`, plus the grants and the upsert-friendly unique key on
`terminal_id`. Once run, the 400 stops immediately.

### 2. Make the heartbeat degrade instead of failing (code change)

In `src/lib/telemetry.ts`:

- Attempt the upsert with the full snapshot as today.
- If the database answers with a missing-column error (PostgREST `PGRST204`/`42703`),
  read the column name out of the message, drop that field from the payload, and retry —
  up to a few times — so a till on an older database still reports its core status
  (terminal, branch, staff, connection, pending count, last sync).
- Remember the reduced column set for the rest of the session so every later heartbeat
  goes straight through instead of failing first.
- Keep the existing silence: telemetry never interrupts trading, but log one console
  warning naming the missing column so the cause is visible in the browser console.

### 3. Surface it once in the telemetry centre

On the branch telemetry screen, show a single quiet notice when columns were dropped:
"Some device details are unavailable — this database is missing recent telemetry columns."
with the SQL fix pointed to in settings. No behaviour change otherwise.

## Technical notes

- Files touched: `src/lib/telemetry.ts` (retry + column-drop logic),
  `src/components/pos/settings/panels/TelemetryPanel.tsx` (notice).
- No change to `snapshot()` shape, the heartbeat interval, or `TelemetryAgent`.
- Nothing here alters your database automatically; step 1 stays a manual script you run.
