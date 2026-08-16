# Health checks: permissions, the missing function, and two SQL exports

## What the live database actually says

Checked against the live database, not the repo `.sql` files:

- `operational_relational_health()` **does exist** and is security-definer, but it has **no EXECUTE grant to anyone** (`information_schema.routine_privileges` returns zero rows for it). So every call is refused, and the screen reports it as "missing". That is the real cause of the relationship-check error.
- The "Account not allowed to read the database table list" message comes from the feature probe reading the Data API's published table list. It already attaches the signed-in session token, so it fails whenever the device is signed in with a till PIN rather than a full account — the request lands as an anonymous caller.
- Operational tables already have RLS enabled with policies; `cashiers` and `pin_attempts` are deliberately locked with none. Nothing here removes that.

## What will change

### 1. The relationship check starts working
Grant `EXECUTE` on `public.operational_relational_health()` to signed-in accounts and the service role. The screen then shows the real link/orphan table instead of a "not installed" message.

### 2. The table-list read stops depending on who is signed in
Add a small server-side endpoint that returns just the table/column shape (names only, no data). The Check Features screen calls it, so a till signed in with a PIN gets the same answer as an admin. If it truly cannot be reached, the message says plainly which sign-in is needed instead of showing a bare permission error.

Role gating on the screen is widened to accept admin, owner, super_admin, manager and staff-level accounts, matching the wording you asked for.

### 3. Two SQL files, both idempotent

- `supabase/migrations/20260816000000_fix_health_check_permissions_and_rpc.sql` — for version control and `supabase db push`. Contains: `CREATE OR REPLACE` of the health function with `SECURITY DEFINER` and a fixed `search_path`, its `GRANT EXECUTE` to `authenticated` and `service_role`, `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for anything the live scan proves is absent, the matching `GRANT`s, `ENABLE ROW LEVEL SECURITY`, and staff/admin policies created only when not already present.
- `supabase/online_setup_fix.sql` — the same content as one paste-and-run script for the web SQL editor, written so re-running it is always safe (policy creation guarded in `DO` blocks, drops before creates, `IF NOT EXISTS` throughout).

The live scan is re-run first; if no table or column is actually missing, that section is written as an explicit "nothing missing" note rather than inventing changes.

### 4. Closing summary
The reply will list both file paths, say which is for CLI/git and which is for the dashboard, and give the numbered steps to run the online script.

## Technical notes

- Grants applied through the migration tool (the live database is Lovable Cloud), with the same SQL mirrored byte-for-byte into the two repo files.
- `src/lib/feature-schema.ts`: table-shape read moves behind a server function; permission wording split from sign-in wording.
- `src/lib/db-relations.ts`: keeps the 42883-vs-42501 distinction so the two failures are never conflated again.
- `src/components/pos/settings/panels/FeatureSchemaReport.tsx`: widened access check and clearer error toast.
- Patch version bump per project convention.
