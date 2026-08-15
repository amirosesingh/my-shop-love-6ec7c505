# Phase 3 — Conflict resolution and visible failures

Phases 1 and 2 are done: all three engines share the same schema shape, and screens now read and write through the router. What is still missing is what happens when two places change the same record, and what an operator can actually see and do when a change refuses to sync.

## What is wrong today

- The till's push sends whole rows to the central database with no version check, so a bill-time edit made on a laptop can be overwritten by a till that had an older copy of the same product.
- The desktop pull already refuses to overwrite unsynced local edits (last-write-wins was added in Phase 1), but the push side has no equivalent guard — the protection only works in one direction.
- The browser queue does not carry a version at all, so a queued change replayed hours later lands as if it were the newest.
- Changes that cannot be saved are set aside ("needs attention") and counted, but there is no screen listing them, so nobody can see what was lost or retry it.

## What will be built

### 1. A version guard in the central database
A guard on every synced table quietly ignores an incoming change that is older than the copy already stored (compared on the record's version counter, then on its last-changed time). Newer changes still apply exactly as now. This protects the direct path and the server relay together, so no caller can bypass it.

### 2. Versions travel with every change
Records queued on a till carry the version they were based on. The desktop mirror already tracks this; the browser queue starts stamping it from the terminal's copy when the change is made.

### 3. The till learns when it lost
After a push, the till re-reads the versions of the records it just sent. Where the central copy moved on without it, the till pulls the newer record down, replaces its own copy, and writes one plain-language line into the sync log: which record, which field group, and that the central copy was kept.

### 4. A "Needs attention" list
The Sync hub gains a panel listing every set-aside change: what it was ("Updating products"), when it happened, which till it came from, how many times it was tried, and the reason. Each row gets Retry and Discard, and Discard asks for confirmation. This is also where conflict entries from step 3 are shown.

## Technical notes

- Database migration: a `BEFORE UPDATE` trigger function (`public.skip_stale_update`) attached to the 27 tables that already carry `row_version`; it returns `OLD` when `NEW.row_version < OLD.row_version`, and falls back to `updated_at` when either version is null. Applied through the migration tool, so it needs approval.
- `src/lib/sync-outbox.ts`: queued entries gain `baseVersion`; `src/lib/sync-engine.ts` attaches it on push and runs the post-push version reconciliation.
- `electron/sync/worker.cjs` / `electron/db/repo.cjs`: push includes `row_version`; rejected rows are re-pulled and marked synced rather than retried forever.
- `src/lib/sync-log.ts` gains a `conflict` entry kind; `src/components/pos/sync/SyncHub.tsx` gets the new panel; retry/discard reuse the existing outbox helpers.
- Stock stays on the movement-delta path and is exempt from the version guard, so a physically counted delta is never discarded as "stale".

## Not in this phase

Two-way sync for the browser build (Phase 4) and dead-letter export.
