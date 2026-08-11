# Repair staff SQL and unify terminal authentication

## Confirmed architecture

The application currently uses backend Auth and should keep it:

- Administrators and email staff sign in with email/password.
- Terminal staff enter username/PIN; the server maps that to an internal login identity, then establishes a normal authenticated session.
- `app_users` is the canonical staff profile and permission source.
- `cashiers` is only a legacy compatibility table, but several SQL statements and two fallback login paths still assume it exists.

The connected database currently contains `cashiers`, while the supplied SQL files fail on another/fresh database where it is absent. The scripts therefore need to support both states without recreating the obsolete table.

## Implementation

1. **Make SQL 22–25 portable and idempotent**
   - In `22_roles_and_pin_gates.sql`, guard the legacy cashier column/backfill operations and legacy routines with `to_regclass`/`undefined_table` handling.
   - Make `list_cashiers()` return an empty result if the legacy table is absent.
   - Guard the optional `pos_store_settings` section so staff-account setup is not blocked when that separate module is absent.
   - In `23_unified_staff_accounts.sql`, remove the compile-time `%rowtype` dependency on `public.cashiers` and keep migration helpers safe when the table is absent.
   - In `24_staff_management.sql`, conditionally run cashier grants, RLS changes, migration, and verification only when the table exists.
   - Recheck `25_staff_account_lifecycle.sql`; retain its existing guarded legacy cleanup.

2. **Keep backend Auth, remove active runtime dependence on `cashiers`**
   - Keep account provisioning through the server-side Auth Admin API and keep `app_users`/`user_roles` as RBAC sources.
   - Update PIN session issuance and the cashier-login endpoint to verify against `app_users` through `verify_terminal_pin`, not `verify_cashier_pin`.
   - Keep legacy cashier lookup only as an optional migration fallback in the account-healing code; a missing legacy table must fail closed without showing a server-connectivity error.
   - Preserve the existing offline cached-PIN flow, but align any server-issued session with the canonical `app_users` identity.

3. **Harden authorization boundaries**
   - Keep privileged create/update/delete operations server-side and supervisor-authorized.
   - Ensure staff management server functions remain thin wrappers and do not expose privileged keys or accept caller-selected authority.
   - Restrict PIN-verification routines to only the roles/endpoints that require them and return minimal identity fields.
   - Preserve deactivation, self-delete prevention, last-admin protection, and role/permission synchronization.

4. **Deliver updated SQL files**
   - Update the downloadable SQL 22–25 files in place with clear run order and compatibility notes.
   - Add an ordered consolidated upgrade SQL file containing the repaired 22–25 changes for databases that have not applied them yet.
   - Apply the equivalent schema changes to the connected backend through the approved migration flow; do not create `cashiers` where it is absent and do not delete it automatically where legacy records may still need migration.

## Verification

- Validate the SQL against both conditions: `cashiers` present and `cashiers` absent.
- Confirm `staff_roles`, `app_users.role_slug`, `app_users.pin_length`, and all unified staff RPCs exist with the intended grants.
- Test Accounts create, edit, deactivate/reactivate, permission update, PIN/password reset, and permanent delete.
- Test one username/PIN sign-in and one administrator email/password sign-in, confirming both receive authenticated sessions and load the correct `app_users` role/branch.
- Confirm no normal login request calls `verify_cashier_pin`, and missing legacy tables no longer produce “Can't reach server” or relation-not-found errors.

## Technical scope

Expected updates include SQL files 22–25 plus the consolidated upgrade file, staff PIN session/login server code, and only the minimal auth-context adjustments required to remove the obsolete fallback. No change to the selected backend Auth model or unrelated POS features.
