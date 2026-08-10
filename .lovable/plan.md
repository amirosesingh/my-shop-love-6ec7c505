# Finish features 2 and 3: offline queue visibility and unified error popups

Feature 1 (terminal branch binding and shift unblocking) is done: the till's
branch is persisted at start-up and re-bound on every sign-in, and an open
shift can no longer be re-locked by a stale or offline read.

## What is already in place

- Every transactional write (sales, shifts, drawer/cash-flow, inventory,
  members, receiving) goes through one commit path that stores the change on
  the device — local SQL Server on Windows, the on-disk outbox in the browser —
  before any network call, and refuses to continue if it could not be stored.
- A background loop drains the queue every 15 seconds and immediately when the
  connection returns, replaying oldest-first per terminal with backoff, so a
  sale always lands before its lines.
- Queue entries now carry a `pending` / `failed` status and a plain-language
  error translator exists, with a catch-all popup for anything unhandled.

## What is missing

1. **The queue is invisible to staff.** Sync & Backup shows totals only. Nobody
   can see which sale is waiting, which one was refused and why, or when it
   last tried.
2. **Half the app still shows raw database text.** Roughly thirty screens call
   the toast directly with the Postgres message, so cashiers still meet
   "violates foreign key constraint" and "JWT expired" wording.
3. **Silent offline failures.** Failures are deliberately swallowed while the
   device is offline. Correct for a queued write, wrong for an action that was
   never queued — the user sees nothing at all.

## The work

1. **Pending transactions panel** in Sync & Backup: one row per queued change
   with what it was, when it happened, which branch and till, its status
   (waiting / retrying / refused), the reason in plain words, and the next
   retry time. Actions: retry a refused item, retry all, and discard a refused
   item with a confirmation.
2. **Status badge in the register header** showing waiting-count and last
   successful sync, so a cashier knows work is still unsent without leaving
   the till.
3. **Route every failure through the notifier**: replace direct raw-message
   toasts in the settings, inventory, purchasing, members, staff, bookings,
   transfers, coupons and shift screens with the shared translator, keeping
   each screen's own wording for the action.
4. **Never fail silently offline**: an offline action that was safely queued
   shows a calm "Saved on this terminal — will sync" note; an offline action
   that could not be stored shows a real error.

## Technical notes

- `src/lib/sync-outbox.ts`: expose the queue with derived status and next-retry
  time; keep the existing shape so nothing else changes.
- `src/components/pos/SyncSettings.tsx`: add the transaction table; reuse
  `retryQuarantined` / `discardQuarantined` and add single-entry equivalents.
- `src/lib/pos-db.ts`: `dbError` delegates to `describeError`; the offline
  early-return becomes an informational note instead of silence.
- Screen-level edits are message-only — no change to queries, permissions,
  purchasing, receiving, product-deletion guards, session tokens or layouts.
- No database migration.
