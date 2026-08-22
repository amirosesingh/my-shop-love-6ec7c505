# Why "A till account must be assigned to a branch" happens, and how to allow all-branch accounts

## What I verified

- The central database has a trigger `app_users_require_store` on `app_users`, firing `BEFORE INSERT OR UPDATE`, which raises exactly this error when `store_id` is empty and the account's role is not `admin` or `manager`.
- The staff form already supports "All branches": choosing it sends `store_id = null`.
- The server writer (`src/lib/staff-admin.server.ts`) stores the role as `cashier`, `supervisor` or `admin`. The trigger only exempts `admin` and `manager` — the word `supervisor` is not in its exemption list. So both cashiers and supervisors are rejected when no branch is picked.
- `app_users` currently holds 0 rows, matching "nothing can be created".

So the failure is purely the database rule; the UI and server code already handle a branch-less account.

## The knock-on problem (the real decision)

Removing the trigger alone is not enough for a working multi-branch cashier, because branch access is derived from the same column:

- `user_store_id()` returns the account's `store_id`. Empty means "unknown".
- `user_has_store_access(store)` allows a row only when the account's `store_id` equals that store (unless the account is admin/manager). With no branch, a cashier can read/write nothing.
- The sync relay (`src/lib/relay-policy.server.ts`) refuses a push with "This till is not assigned to a branch" when the session has no branch and the user is not a supervisor.

Good news: the terminal already carries a branch. The staff picker for a terminal (`terminal_staff_list`) already treats a branch-less account as "shows on every terminal", and the relay takes the branch from the session first and only falls back to the account row. So the intended design — the person is branch-less, the terminal supplies the branch — is half-built already.

## Proposed change (Option A: terminal supplies the branch)

1. Replace the `app_users_require_store` trigger so a `NULL`/empty `store_id` is allowed for every role. Keep the trigger only to normalise empty strings to `NULL` (or drop it entirely).
2. Update `user_has_store_access()` so an active staff account with no branch is treated as "any branch" (equivalent to today's admin/manager path), instead of "no branch".
3. Leave `user_store_id()` returning `NULL`, and make the writer paths that stamp `store_id` on sales/shifts use the terminal branch, which they already prefer.
4. In the relay, keep refusing only when neither the session nor the account can supply a branch, and make sure a cashier session always carries the terminal's branch so writes are stamped with the till's branch, not blank.
5. Staff Management: label the empty option clearly as "All branches (branch comes from the terminal)" so the choice is explicit.

Effect: one cashier account signs in on any terminal; every sale, shift and audit row is stamped with that terminal's branch. Branch isolation for reports stays intact because rows still carry a real branch.

## Alternative (Option B: keep the rule, assign multiple branches)

Add a `app_user_stores` link table so a person can be listed against several specific branches, and have `user_has_store_access()` check that list. More control (a cashier can be limited to 3 of 10 shops), but more work and a new admin UI.

## Technical notes

- Migration: recreate `public.app_users_require_store()` without the role condition (or drop the trigger), and recreate `public.user_has_store_access(text)` with the branch-less-means-all clause.
- Code touched in Option A: `src/lib/staff-admin.server.ts` (no change needed beyond confirming it passes `null`), `src/lib/relay-policy.server.ts` (branch fallback wording/logic), `src/components/admin/StaffManager.tsx` (label only).
- Risk: step 2 widens read/write access for any account with no branch. Accounts must therefore never be left branch-less by accident — the form should keep the branch picker explicit rather than defaulting to "All branches".

## Decide

Tell me A (branch-less = all branches, terminal decides) or B (multi-branch assignment list), and I will implement it.
