# Fix till account saving and push changes to the shop SQL Server instantly

## What I verified

- The account form lives in `src/components/admin/StaffManager.tsx`; accounts are rows in `app_users` (there is no `till_accounts` table), and the branch is the `store_id` column.
- The branch dropdown currently defaults to "All branches", so a save can go out with no explicit branch choice and the failure surfaces only as "Account could not be created/updated".
- The database rule that used to reject branch-less accounts was already relaxed, and branch-less accounts are stamped with the terminal's own branch at sign-in.
- The sync engine (`src/lib/sync-engine.ts`) pulls central changes on a 15-second timer; there is no live listener, so a staff edit can take up to 15 seconds to reach the shop database.

## 1. Branch becomes an explicit, validated choice

- The dropdown opens with nothing selected and a "Select a branch" placeholder; options are the live branch list plus an explicit "All branches — terminal decides" entry.
- Saving is blocked until one of them is chosen, with an inline red message under the field ("Choose a branch, or All branches") instead of a save-time failure.
- Editing an account pre-selects its current branch (or "All branches" when it has none), so no edit can silently drop the branch.
- The branch is always included in both the create and the update request.

## 2. Clear success and failure messages

- Success toast names the account and its branch, e.g. "Sarah saved — Bukit Bintang".
- Failure shows the real reason as the headline (duplicate username, PIN too short, permission refused, network unreachable) rather than the generic wording, with the technical detail underneath.

## 3. Instant push to the shop SQL Server

Because the SQL Server runs on your own PC with no public address, the cloud cannot call it. The till does the listening instead:

- The desktop app subscribes to live change events on the account and settings tables. On any insert, update or delete it immediately runs a targeted sync cycle, so the change lands in the local SQL Server in about a second instead of waiting for the timer.
- The 15-second timer stays as the safety net for anything missed while offline.
- A change that arrives while the till is offline is applied on the next reconnect, in order.

## 4. Retry and visible logging

- A failed push is retried with growing gaps (roughly 2s, 10s, 30s, then the normal cycle), and the record stays marked pending until the shop database confirms it.
- Every attempt is written to the existing sync log with table, row and reason, so "Server vs. shop data" shows exactly which record has not reached SQL Server yet, and the status pill flags a stuck record.

## 5. Verification

- Create an account with a branch selected; confirm the success toast, the branch in the list, and the row appearing in local SQL Server within seconds.
- Edit an account to a different branch and to "All branches"; confirm both persist after reload and both reach SQL Server.
- Attempt a save with no branch chosen and confirm the inline error, with no request sent.
- Force a duplicate username and confirm the specific message.
- Pull the network, make an edit, restore the network, and confirm the retry lands and the log shows the recovery.

## 6. Version

Bump the app version (patch) so the desktop build and update feed report the change.

## Technical scope

- `src/components/admin/StaffManager.tsx` — placeholder branch state, inline validation, pre-fill on edit, specific error/success toasts.
- `src/lib/staff-admin.server.ts` — pass through precise backend errors instead of collapsing them.
- `src/lib/sync-engine.ts` — realtime subscription for `app_users`, `staff_roles`, `pos_settings`/`pos_store_settings`, triggering an immediate cycle plus backoff retry.
- `src/lib/sync-log.ts` / sync status — record per-row push attempts and failures.
- `src/version.ts` via `scripts/bump-version.cjs`.
- No schema change is needed: `app_users.store_id` already references the branch list.
