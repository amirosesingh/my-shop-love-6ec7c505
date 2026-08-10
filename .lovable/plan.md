# One clean staff-management SQL file, with the leftovers removed

Staff data currently lives in two places: the real accounts table and an old `cashiers` table that the new unified sign-in no longer needs. This produces a single, self-contained staff SQL file and safely retires everything the app stopped using.

## 1. New file: `supabase/sql/24_staff_management.sql`

Run once, safe to re-run. In order:

- **Rescue first.** Any cashier row not yet copied into the accounts table is adopted automatically (name, PIN, role, active flag), so nobody loses their sign-in.
- **Retire the old cashier table.** Only after the rescue step reports zero remaining rows, the `cashiers` table and its routines (list, upsert, delete, PIN check, cashier permissions, cashier role) are removed. If anything is still unmigrated the file stops with a clear message and drops nothing.
- **Trim unused fields on the accounts table.** `store_id` on staff rows is ignored by the till (the terminal decides the branch), so it goes, along with the stale duplicate unique index left behind by earlier versions of the schema.
- **Tidy the role table.** Roles nobody holds and that are not built-in are deleted; the four built-in roles are re-asserted.
- **Re-state the access rules** for the accounts, roles and role-assignment tables in one place: staff read their own record, supervisors manage everyone through the guarded routines, visitors get nothing.

Registered at the end of `supabase/sql/99_run_all.sql`.

## 2. Code that must follow the SQL

Three files still call the removed cashier routines and would error once the file runs:

- `src/lib/pos-cashiers.ts` — deleted.
- `src/routes/staff.tsx` — the Directory tab drops its second "cashier rows" source and lists accounts only, matching the new Accounts tab.
- `src/lib/pos-auth.tsx` — the legacy `verify_cashier_pin` fallback is removed; the unified account PIN path stays.

## 3. What is deliberately kept

- Everything in `23_unified_staff_accounts.sql` (provisioning, PIN set, activation, terminal staff list).
- `user_roles` — still the source of truth for the admin/manager checks used across the database.
- All staff history: audit rows, shift sessions and sale attribution reference names, not cashier ids, so nothing breaks.

## Technical notes

- The old table is dropped, not renamed; take a backup first if you want a rollback path. Say the word if you'd rather it be renamed to `cashiers_retired` for one release instead.
- Routine drops are individually guarded, so a routine still referenced elsewhere leaves the file able to finish.
- `supabase/sql/02_staff_and_access.sql` keeps its cashier section, but that section becomes a no-op once the table is gone; the new file is authoritative.