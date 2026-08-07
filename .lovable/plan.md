# Browser sign-in fix, secrets out of the code, encrypted settings, and a database health page

## 1. Shift sign-in works in Chrome for admins and supervisors

Today the fallback that saves data when the database refuses a direct write ("server write
relay") is only switched on for activated tills. In a plain browser it is off, so any write
that the access rules refuse ends with "This till is not allowed to save shift_sessions on
the central database yet", and the connection panel shows a red "This till is not activated
yet" even though a till was never meant to exist there.

- Turn the relay on whenever there is a valid signed-in staff session in the browser, not
  only for activated tills. The relay endpoint keeps proving the caller (staff session,
  cashier session, or terminal token) before writing, so nothing becomes anonymous.
- In a browser, "Terminal registered" stops being a failure: it shows a neutral
  "Browser session — no till registered", and the checks that matter become the signed-in
  account, the branch assignment and the server route.
- Replace the confusing error with one that says which of these is actually wrong:
  not signed in, no branch assigned, or a genuine access-rule refusal.

## 2. The service key lives in secrets, never in the repository

Checked the code: the service key is **not** in the codebase. It is read on the server only,
from the `POS_SUPABASE_SERVICE_ROLE_KEY` secret, in `src/lib/pos-relay.server.ts`. What is in
code is the project URL and the publishable key, which are safe to be public by design.

To make the repo safe to push to GitHub:
- Move the project URL and publishable key to environment variables as the primary source,
  keeping the current values only as a fallback for the published build.
- Add `.env.example` with names and no values, confirm `.env` is git-ignored, and add a short
  `docs/secrets.md` listing every secret the app expects and where to set it.
- Add a test to the security suite that fails the build if a key-looking string is committed
  anywhere under `src/`.

## 3. Settings stored encrypted, locally and online

The encrypted store already exists (`secure_settings` table plus AES-256-GCM helpers).
Extend it so sensitive configuration no longer sits in plain rows or plain local storage:

- WhatsApp token and phone ID, bank transfer account details, update-feed tokens, printer and
  integration keys, and the local SQL Server connection details.
- Written encrypted, decrypted on the server only, shown masked in the UI with a
  "replace value" action; no plain value is ever sent back to the screen.
- On the till, the same values are kept in the existing encrypted device store, so someone
  with access to the machine cannot read or edit them from a file.

## 4. New "Database health" page

A new page under System & Settings that checks every core table (products, members, sales,
sale items, shifts, shift sessions, bookings, held orders, stores, settings, coupons,
vouchers, transfers, purchase orders, audit logs) and shows one row per table with:

- a read result — green with the row count, or red with the exact reason (not signed in, no
  access rule, missing table, network)
- a write result — a harmless no-op write is attempted so you can see whether saving works,
  both directly and through the server route
- header checks: which database the app is pointing at, whether a staff session exists,
  branch assignment, and whether the server relay answers
- a "Copy report" button so the result can be pasted back here

## Technical notes

- `src/lib/sync-relay.ts` — `canRelay()` also true when a Supabase session exists.
- `src/lib/sync-engine.ts` — `describeError()` separates activation, permission and network.
- `src/components/pos/ConnectionCheck.tsx` — browser-aware labels, no false red.
- New `src/lib/db-health.ts` (per-table `head/count` probe + guarded write probe) and route
  `src/routes/settings.diagnostics.tsx`, linked from the settings hub.
- `src/lib/external-supabase-config.ts` — env-first with fallback.
- Sensitive settings routed through `secure-settings.functions.ts` / `.server.ts`.
- `supabase/sql/99_fix_grants_and_helpers.sql` — one script to run once on your own Supabase
  project, restoring execute rights on the access-rule helpers (`is_staff_now`,
  `is_supervisor_now`, `has_perm`, `store_visible`, …) and table grants. This is what causes
  "permission denied for function is_staff_now" on the live database.
