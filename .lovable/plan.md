# Separate cashiers into their own table

Cashiers currently live in the same staff table as admins and supervisors, and each cashier also needs a hidden login account just to sign in with a PIN. This moves cashiers into a dedicated `cashiers` table with no login account at all: a cashier is simply a row with a name, username, hashed 6-digit PIN, assigned store, and permission toggles.

## What changes for you

- **Staff management** keeps one screen, but with two clearly separated lists: "Supervisors & Admins" (email + password accounts) and "Cashiers" (username + 6-digit PIN, no email).
- **Creating a cashier** no longer fails on account creation — it just writes a row, so the previous signup errors disappear.
- **Cashier login** on the terminal stays the same: username + 6-digit PIN on the PIN tab. Admins/supervisors keep the email tab.
- **Existing cashiers** are moved into the new table automatically, keeping their username, store assignment, permissions and PIN. Their rows are removed from the shared staff table so admins and cashiers are never mixed again.
- **Permission toggles** for cashiers work exactly as now (same 19-switch matrix), saved against the new table.

## Trade-off to be aware of

Because cashiers no longer have real backend accounts, their session is app-level: the terminal itself is what talks to the database, and per-cashier database-level restrictions are enforced through the app plus the shared terminal identity. Sales, refunds and audit entries still record which cashier performed them.

## Technical outline

New SQL script `supabase/schema5.sql` (run in the SQL editor, idempotent):

- `public.cashiers`: `id`, `username` (unique, citext-style lower), `full_name`, `pin_hash` (pgcrypto bcrypt), `store_id`, `permissions jsonb`, `is_active`, `created_at`, `updated_at` + updated-at trigger.
- Grants for `authenticated` / `service_role`, RLS on, policies: staff can read; only admins/managers (`is_app_supervisor()`) can insert/update/delete.
- Security-definer RPCs: `list_cashiers()`, `upsert_cashier(p_id, p_username, p_full_name, p_pin, p_store_id, p_is_active)`, `set_cashier_permissions(p_id, p_permissions)`, `delete_cashier(p_id)`, and `verify_cashier_pin(p_username, p_pin)` returning the cashier row (never the hash) on match.
- Migration block: copy all `app_users` rows with role `cashier` into `cashiers` (username from `user_id`, permissions preserved, PIN re-hashed where a hash exists, else flagged for reset), then delete those rows from `app_users`; ends with `notify pgrst, 'reload schema'`.

Frontend:

- `src/lib/pos-cashiers.ts` (new): typed wrappers for the cashier RPCs.
- `src/lib/pos-auth.tsx`: `cashierLogin` calls `verify_cashier_pin` instead of `supabase.auth.signInWithPassword`; on success it stores the returned cashier (id, username, store, permissions, role `cashier`) as the terminal session and persists it, so lock/switch-user and shift tagging keep working. Admin/supervisor auth path untouched.
- `src/lib/pos-permissions.tsx`: when the active session is a cashier, read permissions from the cashier session rather than `current_app_user`.
- `src/routes/staff.tsx`: split the list into two sources (`list_app_users` for supervisors/admins, `list_cashiers` for cashiers); cashier create/edit/delete/PIN-reset and permission toggles route to the new RPCs; supervisor/admin flows unchanged.
- `src/lib/pos-users.ts`: drop `createCashierAccount` / `cashierEmail` / `cashierSecret` usage for new cashiers (keep email helpers for supervisors/admins).
