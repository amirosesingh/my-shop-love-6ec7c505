# Phase 4 — Sync you can act on

Phases 1–3 are done. This phase makes sync a single, honest screen you can act
on, instead of four part-views that each tell a bit of the story.

## What the code shows today

Confirmed by reading the sync code and screens just now:

- Sync detail lives in **four** places: the Sync page (table-by-table panel and
  a settings card with the pending list), the System & general page under a
  "Data sync" tab (a second, richer hub with the queue, audit ledger, conflicts
  and diagnostics), a status panel with its own "retry parked changes" button,
  and a separate activity-log viewer. They read the same underlying state, so
  they don't disagree — but nobody can say which one to open.
- The queue itself is already good: every waiting change knows its state
  (waiting / retrying / refused), the reason it failed, how many attempts it has
  had and when it will next be tried. Retry one, retry all parked, discard one
  and discard all parked all exist, and discarding puts the local copy back.
- What is **missing** from every view: the time the central database last
  acknowledged a change, the age of the oldest waiting change, and a per-row
  reason tag (connection / sign-in / clash / data problem) even though failures
  are already classified that way in the log.
- Replay protection exists for sales, payments, shift closing and stock
  movements — each carries a stable key so a reconnect updates instead of
  double-posting — and there are tests for sales and stock. Transfers and the
  "run a database routine" queue entries are **not** covered by a test, so the
  guarantee is unproven there rather than known to be broken.

## What gets built

### 1. One sync screen

The Sync page becomes the single place. It shows, top to bottom:

- Connection, last successful sync, last acknowledgement from the central
  database, waiting count, failed count, and how old the oldest waiting change
  is.
- The existing table-by-table progress list and the one "Sync now" button.
- The waiting-and-failed list (below).
- The activity log and the sync behaviour settings already on the page.

The "Data sync" tab on the System page and the duplicate retry button on the
status panel stop being separate destinations: the tab redirects to the Sync
page, and the status panel links to it. Nothing is deleted — the richer hub's
parts (audit ledger, conflicts, unapplied stock, local engine info) move onto
the Sync page so no capability is lost.

### 2. A failed list worth reading

One table of everything not yet accepted: what it was, which till and branch,
when it happened, why it failed (as a coloured tag), how many attempts, and
when it will next be tried. Filters by state and reason. Retry on each row,
Retry all, and — behind a typed confirmation naming the number of changes —
Discard, which still restores the local copy so the till never shows a change
that will never be sent.

### 3. Replay protection, proven

Add tests that reconnecting after an outage cannot double-post: a transfer, a
booking payment, a refund routine and a shift close each replayed twice must
leave exactly one record and one stock movement. Where a queue entry runs a
database routine without a stable key, give it one so the second run is a
no-op. No behaviour changes where a key already exists.

## Not in this phase

Settings regrouping (Phase 5) and the server-side access review (Phase 6). No
schema change unless a missing replay key turns out to need one — if it does,
it is one additive unique key and it will be shown for approval separately.

## Technical notes

- New `src/lib/sync-summary.ts`: one derived view (connection, lastSyncAt,
  lastAckAt, pending, failed, oldestPendingAt) built from `sync-status.ts`,
  `sync-outbox.ts` (`queueView`) and `sync-log.ts`; consumed by the Sync page
  and the header badge so both read one source.
- Last acknowledgement recorded in `drainOutbox()` in `src/lib/sync-engine.ts`
  when the server confirms a batch, stored beside `pos.sync.lastSyncedAt`.
- `SyncPanel.tsx` gains the summary strip; the queue table moves out of
  `SyncSettings.tsx` and `SyncHub.tsx` into a new `SyncQueueTable.tsx` used
  once, rendering `QueueView.state` plus `SyncFailureKind` from `sync-log.ts`.
- `src/routes/settings.system.tsx` drops the `data-sync` tab and redirects that
  search value to `/settings/sync`; `settings-catalog.tsx` points the "Data
  sync" entry at the Sync page.
- Tests under `src/lib/__tests__/`: `sync-summary.test.ts` and
  `replay-idempotency.test.ts`, alongside the existing
  `stock-delta-batch.test.ts` and `checkout-e2e.test.ts` patterns.
- Typecheck, lint and the full Vitest run, then a version bump.
