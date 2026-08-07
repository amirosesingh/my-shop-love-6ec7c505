# Fix web sign-in errors, keep keys out of Git, encrypt sensitive settings, add a database health page

## 1. Make the browser work like the till

Today the "server write relay" (the fallback that saves data when the database refuses a
direct write) is only allowed for activated tills. From a normal browser it is switched
off, so shift sign-in fails with "This till is not allowed to save ... on the central
database".

- Allow the relay whenever there is a valid signed-in staff session in the browser, not
  only for activated tills.
- The relay endpoint keeps verifying the caller (staff session, cashier session, or
  terminal token) before writing — no new anonymous access.
- Replace the confusing message with a clear one that says whether the problem is a
  missing sign-in, a missing branch assignment, or a genuine access-rule refusal.

## 2. Keys and secrets out of the repository

Checked the code: the service key is **not** in the codebase. It is read only on the
server from the `POS_SUPABASE_SERVICE_ROLE_KEY` environment secret, in
`src/lib/pos-relay.server.ts`. Only the public/publishable key and project URL appear in
`src/lib/external-supabase-config.ts`, which is safe and designed to be public.

To make this safe for GitHub:
- Move the project URL and publishable key to environment variables as the primary
  source, with a documented `.env.example` (names only, no values).
- Confirm `.env` is git-ignored and add a short note in `docs/` listing every secret the
  app expects and where to set it.
- Add a check to the security test suite that fails if any key-looking string is
  committed in `src/`.

## 3. Encrypt the sensitive settings

The encrypted store already exists (`secure_settings` table + AES-256-GCM helpers).
Extend it so all sensitive configuration goes through it instead of plain settings rows:

- WhatsApp API token / phone ID, bank transfer account details, update-feed tokens, and
  any integration keys.
- Values are written encrypted, read back decrypted on the server only, and shown masked
  in the UI with a "replace value" action.
- Local device copies continue to use the existing encrypted device-secret store, so
  nothing sensitive is written to the till in plain text.

## 4. New "Database health" page

A new page under System & Settings that runs a read test against every core table
(products, members, sales, shifts, shift sessions, bookings, stores, settings, coupons,
vouchers, transfers, audit logs) and shows one row per table:

- green when the read works, with the row count
- red with the exact reason when it fails (not signed in, no access rule, missing table,
  network)
- extra checks: which database the app is pointing at, whether a staff session exists,
  branch assignment, and whether the server relay answers
- a "Copy report" button so the result can be pasted back here

## Technical notes

- `src/lib/sync-relay.ts` — `canRelay()` also returns true for an active Supabase session.
- `src/lib/sync-engine.ts` — `describeError()` distinguishes activation vs. permission vs.
  network failures.
- New route `src/routes/settings.diagnostics.tsx` + `src/lib/db-health.ts` running
  `select ... head/count` probes per table.
- `src/lib/external-supabase-config.ts` — env-first, fallback kept for the published build.
- Sensitive settings routed through `secure-settings.functions.ts`/`.server.ts`.
- A SQL script `supabase/sql/99_fix_grants_and_helpers.sql` to run once on your own
  Supabase project, restoring execute rights on the access-rule helpers
  (`is_staff_now`, `is_supervisor_now`, `has_perm`, `store_visible`, …) and table grants —
  this is what causes "permission denied for function is_staff_now".
