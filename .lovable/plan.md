# Fix shift sign-in errors in the browser + where the service key lives

## First, the important discovery

The app does **not** read/write the Lovable Cloud database. `src/lib/external-supabase-config.ts` points every read and write at your own POS project (`POS_SUPABASE_URL`, publishable key in code). The grant fix from the last turn was applied to the Lovable Cloud database, so it did **not** touch the database the app actually uses. That is why the errors are unchanged.

Everything below therefore has two halves: a SQL script you run once on **your POS project**, and app-side changes I make here.

## Why the browser fails but the terminal does not

The error text comes from `src/lib/sync-engine.ts`: the database refused the write, so the queued change is parked. There is already a fallback — the server relay at `/api/public/sync`, which re-does the write with the service key after proving who the caller is. The relay accepts three proofs: a cashier session token, a terminal token, or a signed-in staff access token.

But the client-side gate `canRelay()` in `src/lib/sync-relay.ts` only returns true when a cashier token or terminal token exists. In a plain browser (no activated terminal, signed in by email) neither exists, so the fallback is never even tried and the raw refusal is shown. On an activated terminal the fallback runs and the write goes through — exactly the difference you are seeing.

## What I will change in the app

1. **Let the browser use the server relay.** `canRelay()` also returns true when there is a signed-in session, so a web admin's refused write is retried through the relay (which already validates the access token server-side). Nothing new is exposed: the relay still rejects unproven callers with 401.
2. **Better error text.** When the relay is unavailable or refuses, say which of the two problems it is — "not signed in / terminal not activated" vs "the database refused this write" — instead of the single generic sentence.
3. **Connection check.** Extend the existing check panel so it reports, for the current browser: signed-in yes/no, staff role recognised yes/no, branch assigned yes/no, relay reachable yes/no. That turns the next occurrence into a one-glance diagnosis.

## What you run once on your POS project

A single consolidated script, `supabase/sql/99_fix_grants_and_helpers.sql`, safe to re-run, containing:

- Execute rights for signed-in users on the access-rule helper checks (`is_staff_now`, `is_supervisor_now`, `is_staff`, `is_app_supervisor`, `has_role`, `has_perm`, `store_visible`, `user_store_id`, `user_cluster_id`), plus visitor access to `campaign_is_live`. Without these, every access rule that calls them fails with "permission denied for function is_staff_now" — the error you saw.
- Table grants for `authenticated` and `service_role` on every operational table, so the Data API can reach them at all.
- A verification query at the end that prints any helper or table still missing rights, so you can confirm the script worked.

The same two repo scripts that caused the regression (`15_security_and_performance.sql`, `17_public_flags_and_grants.sql`) were already corrected last turn, so re-running the full set no longer strips these rights.

If a staff member is still refused after the script, the remaining cause is data, not permissions: their account needs a row in `user_roles` (admin/manager/staff) and a branch on their staff profile, since the rules also check `store_visible`. The connection check above will state which one is missing.

## Where the service key is stored

It is **not** in the code and never reaches the browser. `POS_SUPABASE_SERVICE_ROLE_KEY` is a backend secret, read only inside server code (`src/lib/pos-relay.server.ts`) at request time. Only the publishable key — which is safe to ship — appears in `external-supabase-config.ts`. A repo test (`route-guards.security.test.ts`) fails the build if any client file references a service key.

## Technical notes

- Files touched: `src/lib/sync-relay.ts`, `src/lib/sync-engine.ts`, the connection-check component, and the new SQL file.
- No change to the relay's server-side verification or to its allow-list of writable tables.