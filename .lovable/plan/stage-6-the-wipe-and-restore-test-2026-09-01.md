# Stage 6 — The wipe-and-restore test

Stage 5 says, on paper, that every feature rebuilds after a wipe. Stage 6 makes
the till prove it against real data instead of against the registry.

## What exists today

- The restore path is real: an operator-triggered, branch-scoped, 90-day,
  paged restore across the restore tables, plus settings, with a running
  progress report and a `last_restore_at` stamp.
- Nothing ever checks the result. A restore reports how many rows it merged —
  never whether that is all the rows head office holds for this branch, and
  never whether an empty till ends up equal to the central record.

## What gets built

### 1. Rebuild check — safe, run any time

A single button in Sync that answers "would this till come back?" without
touching a thing:

- For every restorable table, count what the till holds for this branch in the
  restore window, and count what head office holds for the same branch and
  window.
- Report per table: in step, behind by N rows, or ahead by N (work not yet
  pushed).
- Give one plain verdict at the top — "This till would rebuild completely" /
  "N tables would come back short" — with the shortfall named in shop language.
- Store the last verdict and its time so it is visible without re-running.

Being "ahead" is not a fault: it means the outbox still has work. The check
says so rather than flagging it red.

### 2. The drill — an actual wipe and restore

The only honest test is doing it. Guarded, deliberate, and reversible:

- Available only when the outbox is empty, no shift is open, and a connection
  is live. Otherwise the button explains which condition is not met.
- Takes a full copy of the local database first.
- Clears the restorable tables, runs the ordinary restore, then re-runs the
  rebuild check and compares row counts and a per-table checksum against the
  before picture.
- Passes only when every table comes back equal. On any shortfall it puts the
  copy back automatically and reports exactly which table lost what.
- Writes a dated result — pass or fail, per table — kept on the till and shown
  in Sync and in Logic Health.

Settings, terminal activation and sealed credentials are never cleared; they
are not trading history and clearing them would unpair the till.

### 3. The result, written down

The drill's outcome becomes the evidence line in the audit trail: a generated
`docs/audit/restore-test.md` recording the last run per terminal, and the same
verdict surfaced in Logic Health next to the recovery table, so the claim
"rebuilds completely" is either backed by a dated pass or plainly marked
untested.

## Technical notes

- `electron/sync/worker.cjs`: `verifyRestore({ days })` reusing the existing
  scoped page-reader for central counts and repo counts locally; `restoreDrill()`
  wrapping backup → clear → `restore()` → verify → rollback-on-fail.
- `electron/db/repo.cjs`: `countScoped(table, window)` and a table checksum;
  backup/restore of the SQLite file, and for the MSSQL target a transactional
  delete limited to `RESTORE_TABLES` with the same store/date scope.
- IPC `pos:restore-verify` and `pos:restore-drill` through `preload.cjs`, typed
  in `src/lib/local-db.ts`.
- UI in `SyncPanel.tsx` (check + drill, with the guard reasons) and a verdict
  line in `RecoverySection.tsx`.
- Last verdict persisted through the existing `repo.setState` key store.

## Not in this stage

Settings restructure (Stage 7), security sweep and final report (Stage 8).
