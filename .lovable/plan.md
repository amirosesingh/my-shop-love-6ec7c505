# Fix the 403 when saving a location

## What the console shows

The browser posts the store row straight to the central POS database
(`/rest/v1/stores?on_conflict=id`) and gets **403 Forbidden**. The app then
retries the same write through the server relay, so this error can appear even
when the save eventually succeeds.

Unconfirmed: whether the relay retry is actually saving the row for your admin
session. Step 1 verifies that before anything is changed.

## Why a signed-in admin can still be refused

The `stores` access rules on the POS database allow writes only when
`is_staff(auth.uid())` is true, and that helper looks the signed-in user up in
the `user_roles` table on **that** database. An admin who signs in with email
but has no matching `user_roles` row is treated as a non-staff visitor, so the
write is refused with 403. This is a likely cause, not yet confirmed — the plan
confirms it before applying the role fix.

## Plan

1. **Confirm the outcome.** Check the sync log and the location list after a
   refresh: did the location that produced the 403 land on the central
   database, or is it sitting failed in the queue?
2. **Confirm the cause.** Read the POS database to see whether the signed-in
   admin's auth user id has a row in `user_roles`, and what `is_staff` returns
   for it.
3. **Repair staff identity.** Add a small, idempotent script under
   `supabase/sql/` that ensures every active admin/manager/staff account in
   `app_users` with a linked auth user also has the matching `user_roles` row,
   so `is_staff` and `is_app_supervisor` agree with the staff list. You run it
   once on the POS database.
4. **Stop the noisy direct attempt.** In the client sync path, remember per
   session that a table's direct write was refused for this account and send
   later writes for that table straight through the server relay. That removes
   the repeated 403 in the console while keeping the faster direct path for
   accounts that are allowed.
5. **Surface a clear message.** If the relay also refuses, show the reason in
   the sync status / diagnostics page instead of only a console error.

## Technical notes

- Files touched: `src/lib/sync-engine.ts` (refusal memo + relay-first), possibly
  `src/lib/sync-relay.ts`, and a new `supabase/sql/20_staff_roles_backfill.sql`.
- No change to the Lovable Cloud backend; all SQL targets your separate POS
  Supabase project and is safe to re-run.
- The relay endpoint and service key handling stay exactly as they are.