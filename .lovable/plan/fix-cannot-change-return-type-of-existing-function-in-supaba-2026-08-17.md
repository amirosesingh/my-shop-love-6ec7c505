# Fix "cannot change return type of existing function" in supabase/schema.sql

## What is happening

The script already handles tables safely: every table uses `CREATE TABLE IF NOT EXISTS` (52 of them) and every column uses `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (763 of them). No table is ever dropped, and none will be.

The failure is only about functions. Postgres refuses `CREATE OR REPLACE FUNCTION` when an existing function with the same name and arguments returns a different row shape — for example `list_app_users()`, which gained columns (`role_slug`, `has_pin`, `pin_length`) since the version installed in the live database. There is no "IF NOT EXISTS" or "replace anyway" option for that case; the old function object must be removed before the new one is created. Dropping a function removes no data.

## The change

Insert a single self-checking guard block right before the routines section (just before `activity_events_immutable`, around line 2570).

For each function the script is about to define, the guard:
1. Checks whether a function with that name already exists in `public`.
2. If it does not exist — does nothing; the `CREATE OR REPLACE` below creates it.
3. If it exists, compares its current output signature (return type plus OUT/TABLE columns) with the one this script defines.
4. Only when they differ does it `DROP FUNCTION` that one function, so the definition below can be recreated cleanly.
5. Each drop is wrapped in its own exception handler, so a routine still pinned by a policy or trigger is skipped instead of aborting the whole script.

Everything else stays untouched: identical functions are left alone, tables, rows, indexes, policies and grants are unaffected.

## Technical notes

- The guard is a `DO $guard$ ... $guard$` block driven by a list of expected signatures (`proname` + `pg_get_function_identity_arguments`) paired with the expected return signature (`pg_get_function_result`), iterated with `EXECUTE 'DROP FUNCTION IF EXISTS ' || oid::regprocedure`.
- Covers all 77 routines in the file; the return-type mismatch only actually bites the 9 `RETURNS TABLE` routines (`current_app_user`, `legacy_cashiers_for_migration`, `list_app_users`, `list_cashiers`, `terminal_staff_list`, `terminal_token_status`, `verify_cashier_pin`, `verify_terminal_pin`, `voucher_by_token`) plus any that changed scalar return type.
- Trigger functions bound to triggers are protected by the per-drop exception handler; if one cannot be dropped the script continues.
- After the guard, existing `GRANT`/`REVOKE` statements on those functions still apply because they are re-issued later in the script.
- Verified by running the file twice against a scratch Postgres instance: fresh install, then re-run with a deliberately older `list_app_users()` in place.
