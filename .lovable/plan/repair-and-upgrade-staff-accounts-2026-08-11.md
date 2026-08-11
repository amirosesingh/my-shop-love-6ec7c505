# Repair and upgrade Staff Accounts

## Confirmed problem

The live database does not match the current Accounts UI:

- `app_users` is missing `role_slug` and `pin_length`.
- `staff_roles` does not exist.
- The unified account routines used by the frontend do not exist, including `staff_account_upsert`, `staff_account_set_active`, `staff_account_set_pin`, and `terminal_staff_list`.
- The current Staff page contains two competing account-management interfaces. Directory duplicates account creation, profile editing, credential updates, role assignment, permissions, and deletion.

This mismatch is why account creation reaches the generic “missing a required field” failure.

## Accounts workspace

- Make **Accounts** the single staff-management screen and remove the **Directory** tab and its duplicate form/handlers.
- Keep **Roles & Permissions** as the second tab.
- Upgrade the Accounts list with search, status, sign-in type, role, branch, and clear row actions.
- Replace the create-only flow with one validated create/edit form covering:
  - required display name;
  - username + 4–6 digit PIN for terminal accounts;
  - email + minimum 8-character password for email accounts;
  - role, branch, and active status;
  - inline field errors, duplicate checks, loading locks, and useful backend errors.
- Add **Edit**, **Change PIN/Password**, and **Deactivate** actions.
- Add **Delete permanently** only for an already inactive account, behind a typed confirmation. Prevent deleting the signed-in account or the last active administrator.
- Keep granular permission editing available from the selected account so removing Directory does not remove RBAC management.
- Remove the obsolete “Bring old cashiers across” button after migration is handled safely by SQL.

## Backend and account lifecycle

- Extend the thin staff server-function wrappers with authenticated update and delete operations.
- Use the server-side admin client only after supervisor authorization.
- Update both the authentication identity and `app_users` profile atomically as far as the platform permits; return precise validation/conflict messages.
- Keep usernames stable after creation. Allow changes to name, role, branch, active status, permissions, and credentials.
- Deactivation remains the normal removal action and immediately blocks future sign-ins.
- Permanent deletion removes the authentication identity, `user_roles` mapping, and staff profile only after the safety checks pass. Existing sales/audit text attribution remains intact.

## SQL update files

Provide ordered, idempotent SQL files in the repository:

1. Update the roles/PIN schema SQL to create `staff_roles`, add `role_slug` and `pin_length`, seed the four built-in roles, backfill existing staff, and define role-management routines.
2. Update the unified-account SQL to define account create/update/activate/PIN/list routines with validation, locked `search_path`, explicit grants, and no anonymous access.
3. Replace the destructive legacy retirement path with a safe migration that copies legacy cashier records but does **not** drop `cashiers` or `verify_cashier_pin` while older login paths may still call them.
4. Add account-deletion SQL with supervisor checks, inactive-first enforcement, self-delete protection, and last-admin protection.
5. Update the run-all manifest and SQL documentation with the exact execution order and verification queries.

Apply the same SQL through one Lovable Cloud migration so the live database and the downloadable repository SQL remain identical in behavior.

## Verification

- Confirm the role selector loads Administrator, Supervisor, Warehouse, and Cashier.
- Create a username/PIN account and an email/password account.
- Edit name, role, branch, permissions, active status, and credentials; reload and confirm persistence.
- Confirm an active account cannot be permanently deleted, deactivation blocks login, and an inactive account can be deleted after confirmation.
- Confirm self-deletion and deletion of the last active administrator are rejected.
- Confirm terminal staff listing and PIN login still work for migrated legacy cashiers.
- Confirm the Staff page now contains only Accounts and Roles & Permissions, with no duplicate Directory controls.

## Technical scope

- Primary UI: `src/routes/staff.tsx`, `src/components/admin/StaffManager.tsx`, and `src/components/admin/RoleManager.tsx`.
- Account API: `src/lib/staff-admin.ts`, `src/lib/staff-admin.functions.ts`, and `src/lib/staff-admin.server.ts`.
- SQL source: `supabase/sql/22_roles_and_pin_gates.sql`, `23_unified_staff_accounts.sql`, `24_staff_management.sql`, a new account-lifecycle update file, `99_run_all.sql`, and the SQL README.
- Payment-account settings, Member Directory, and Supplier Directory are unrelated and will not be changed.