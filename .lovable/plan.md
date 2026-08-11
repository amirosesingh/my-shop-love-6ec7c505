# Fix "account could not be created — missing a required field"

## What is actually wrong

The staff screens were rewritten to use the unified staff-account model, but the database was never updated to match. I checked the live database:

- `app_users` has no `role_slug` and no `pin_length` columns.
- There is no `staff_roles` table.
- None of the routines the staff screens call exist: `staff_account_upsert`, `staff_account_set_active`, `terminal_staff_list`, `staff_account_adopt_legacy`, `legacy_cashiers_for_migration`.

So two things fail at once: the role dropdown has nothing to load (leaving the role blank, which is a required field), and the save call hits a routine that does not exist. The result the user sees is "account could not be created because it is missing a required field".

The SQL for all of this already exists in the project (`supabase/sql/23_unified_staff_accounts.sql` and `24_staff_management.sql`) — it simply was never applied.

## The fix

Apply one migration that brings the live database up to what the app already expects:

- Add `role_slug` and `pin_length` to the staff table (existing rows keep working; missing values default sensibly).
- Create the roles table with the built-in roles — Administrator, Supervisor, Warehouse, Cashier — each with its permission switches, so the role dropdown is populated on first load.
- Create the staff save/activate routines, the terminal sign-in list, and the legacy-cashier adoption helpers, with access limited to the server key and supervisors.
- Carry across any leftover rows from the old cashier table so nobody loses their sign-in.

## After the migration

- Reload the Staff page and confirm the role dropdown lists the four roles.
- Create one username-only staff member with a 4-digit PIN and confirm it saves and appears in the roster.
- Create one email staff member with a password and confirm it saves.
- Confirm the terminal sign-in grid lists the new staff for the bound branch.

If any call still errors, fix the specific field it names — no further code changes are planned, because the app-side payload already sends branch, role and PIN length.

## Technical notes

- Single migration, mirroring `supabase/sql/23_unified_staff_accounts.sql` + `24_staff_management.sql`, written idempotently (`add column if not exists`, `create or replace function`) so re-running is safe.
- `staff_roles` gets GRANTs for `authenticated` (read) and `service_role`, RLS on, supervisor-only writes.
- Privileged routines are `security definer` with a locked `search_path`, execute revoked from `anon`.
- No frontend changes expected; `src/lib/staff-admin.server.ts` already passes `p_role_slug`, `p_store_id` and `p_pin_length`.
