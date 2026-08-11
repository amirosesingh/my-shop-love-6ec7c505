# Make SQL files 22–25 run on a database with no legacy cashier table

## What is happening

Files 22–25 were written for a database that still had the old `cashiers`
table. On a clean database that table was never created, so the very first
statement that touches it stops the whole script with
`relation "public.cashiers" does not exist`.

Confirmed hard references (statements that fail immediately when the table
is absent):

- `22_roles_and_pin_gates.sql`: `ALTER TABLE public.cashiers ADD COLUMN ...`,
  `UPDATE public.cashiers ...`, and `list_cashiers()` selecting from it.
- `24_staff_management.sql`: `REVOKE`/`GRANT`/`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
  on `public.cashiers`, plus the final verification query that counts its rows.

Places already guarded and safe: the legacy loops and routines in
`23_unified_staff_accounts.sql` and `25_staff_account_lifecycle.sql`, which
either check `to_regclass` or trap `undefined_table`.

## The fix

Keep one behaviour on both kinds of database — legacy present or absent —
by making every remaining hard reference conditional.

1. **22_roles_and_pin_gates.sql**
   - Wrap the cashier column add, the backfill, and the role-slug setter in a
     block that runs only when `to_regclass('public.cashiers')` is not null.
   - Rewrite `list_cashiers()` so it returns an empty set when the table is
     missing instead of failing to create or failing on call.
2. **24_staff_management.sql**
   - Move the cashier grants, revokes, and row-level-security switch inside the
     same existence check as the copy loop.
   - Make the closing verification query report `0 rows left to copy` when the
     table is absent rather than erroring.
3. **25_staff_account_lifecycle.sql** — already guarded; only re-checked, no
   behaviour change expected.
4. **File header notes** updated to state that 22–25 are safe on both a fresh
   database and one upgraded from the old cashier layout.

No table is created just to satisfy the scripts, and nothing existing is
dropped: a database that still has `cashiers` keeps working exactly as today.

## Also worth knowing

`22_roles_and_pin_gates.sql` also alters `pos_store_settings`. If that table
does not exist on the same database, the script will stop there next for the
same reason. The same conditional treatment will be applied to that section so
the file completes in one pass either way.

## Verification

- Run `22` → `25` in order on the current database and confirm each finishes
  without error.
- Confirm the four built-in roles exist and `app_users` has `role_slug` and
  `pin_length`.
- Confirm `staff_account_upsert`, `staff_account_set_active`,
  `staff_account_set_pin`, and `terminal_staff_list` all exist.
- Create one username/PIN account and one email/password account from Accounts
  to confirm the earlier "missing a required field" failure is gone.

## Technical scope

Edited files: `supabase/sql/22_roles_and_pin_gates.sql`,
`supabase/sql/24_staff_management.sql`, and a re-check of
`supabase/sql/23_unified_staff_accounts.sql` and
`supabase/sql/25_staff_account_lifecycle.sql`. Application code is unchanged.
The same corrected SQL is applied as one Lovable Cloud migration so the live
database and the downloadable files stay identical.
