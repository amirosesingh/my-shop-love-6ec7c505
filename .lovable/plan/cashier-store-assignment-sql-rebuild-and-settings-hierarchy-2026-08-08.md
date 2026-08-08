# Cashier store assignment, SQL rebuild, and settings hierarchy 500s

## 1. Cashiers are no longer assigned a store

A cashier's branch already comes from the activated terminal, so a second, conflicting
"Assigned store" on the cashier record only causes drift.

- Staff Management: the "Assigned store" picker is hidden for the cashier role in both the
  create dialog and the edit panel. The cashier list shows the branch as "From terminal".
- Admins and supervisors keep the picker exactly as today (including "All stores").
- Cashier create/update stops sending a store; existing cashier store values are cleared so
  nothing stale is left behind.
- Sign-in and shift attribution keep using the terminal's branch (unchanged behaviour).

## 2. SQL files rebuilt with drop-and-recreate

The staff/cashier SQL is currently a long chain of `ADD COLUMN IF NOT EXISTS` patches, which is
why the shape drifts. It gets rewritten as a clean definition:

- `02_staff_and_access.sql`: drop `cashiers` (cascade) then one full create without `store_id`,
  followed by grants, row security, policies, trigger, and the cashier routines
  (`list_cashiers`, `upsert_cashier` without the store parameter, `set_cashier_permissions`,
  `delete_cashier`, `verify_cashier_pin`) recreated from scratch.
- `14_settings_scopes.sql`: `settings_scoped` dropped and recreated in full, with grants, row
  security and the three routines (`settings_effective`, `settings_upsert`,
  `settings_sync_batch`) recreated and executable only by signed-in staff and the server.
- `99_run_all.sql` keeps the same order; the README notes these two files are now destructive.

Warning: dropping the cashier table deletes existing cashier rows and PINs — they must be
re-created afterwards. Admin/supervisor accounts, sales, and shifts are untouched.

## 3. "The central database service key is not configured" + sync 500s

The settings hierarchy first tries the signed-in staff route and, on any failure, falls back to a
server-key read. In the deployed preview that server key is not reaching the server runtime, so
the fallback throws and the sync endpoint answers 500 instead of a clean error.

- Rebind the backend secrets so the server key is actually present in the server runtime, then
  re-check.
- The settings resolver stops depending on the server key: with a staff session it uses that
  identity, and the server fallback only runs when the key exists. Otherwise it returns a clear
  "sign in again" message instead of throwing.
- The sync endpoint returns a readable service-unavailable response (not 500) when the key is
  missing, and records which relay step failed.
- The settings page shows the real reason (identity vs. missing routine vs. backend unreachable)
  instead of the generic defaults banner.

## Verification

- Create and edit a cashier: no store field, save succeeds.
- Create/edit an admin and supervisor: store picker unchanged.
- Open Settings Inheritance at Global, Cluster, and Branch scope: values load, an override saves
  and survives a refresh, no 500 in the console.
- Confirm the relay still refuses unauthenticated callers.