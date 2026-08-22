# Fix “All branches” account updates

## Confirmed cause

- The form correctly treats **All branches** as an explicit valid choice and sends `branchId: null` on both create and update.
- The save path passes that value through to `staff_account_upsert` as `p_store_id: null`.
- The current managed database function already allows a blank branch, but this POS is configured to save staff accounts to a separate central POS database.
- The repository’s baseline `supabase/schema.sql` still contains the older `app_users_require_store` rule that raises **“A till account must be assigned to a branch”** for cashier/warehouse-level accounts. That matches the reported error exactly. An idempotent migration with the corrected rule exists, but the error proves the central POS database being used by the app has not received that correction.

## Changes

1. **Correct the central database rule**
   - Apply an idempotent migration to the actual central POS database used by Staff Management.
   - Keep `app_users.store_id = NULL` as the canonical meaning of **All branches — terminal decides**.
   - Normalize blank strings to `NULL` and permit this value for cashier, warehouse, supervisor, admin, and custom roles.

2. **Prevent the old rule from returning**
   - Update the checked-in baseline schema so a fresh or restored central database receives the corrected function rather than recreating the obsolete branch-required rule.
   - Keep the existing standalone corrective migration for already-installed databases.

3. **Verify role and branch behavior**
   - Update a cashier with a new PIN and **All branches**; verify the account row keeps `store_id = NULL` and the PIN update succeeds.
   - Repeat for a warehouse role.
   - Change each account from **All branches** to a specific branch and back, confirming both values persist after reload.
   - Confirm an all-branch account appears on branch terminals and that operational records are stamped with the terminal’s physical branch.

4. **Version**
   - Bump the patch version after the database and application verification succeeds.

## Technical notes

- No `till_accounts` table or new `branch_id` column is needed; staff accounts use `app_users.store_id`, which is already nullable and references the branch list.
- This fix does not weaken branch attribution on sales or shifts: a branch-less staff profile means the person may work anywhere, while the active terminal supplies the branch for each transaction.
