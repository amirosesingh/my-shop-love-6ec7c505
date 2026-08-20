# Part 1 — Make the connection wizard a finite-state machine

## What the code does today (verified)

- The wizard step "Authenticate handshake" calls `sqlAdmin.connectInstance()` (preload -> `sqladmin:connect`) in `src/components/database/SqlConnectionModal.tsx`. The renderer awaits that call with **no deadline of its own** — if the IPC reply never arrives, that step spins for ever.
- `electron/main.cjs` wraps the channel in `bounded(30_000, ...)`, but only `sqladmin:connect`, `probe-port`, `lock` and `databases` are bounded. `sqladmin:cancel`, `disconnect`, `status`, `tables`, `columns`, `query` are unbounded, so the cancel path itself can hang against a wedged pool.
- Inside `electron/db/admin-pool.cjs`, `connectInstance` runs `openPool` under the ladder budget, but the two follow-up queries (`SELECT @@SERVERNAME ...` and the `sys.databases` list) have **no request timeout**. A driver that connects and then stops answering leaves the handshake stage pending past the ladder budget.
- The hard release timer only flips `run.cancelled` and clears `inFlight`; the abandoned `openPool` keeps running and, when it finally resolves, its pool is never closed — an orphan connection plus a late result.
- `connectInstance` refuses with `EBUSY` if a predecessor has not let go within the release wait, which is what surfaced as "A connection attempt is already running".
- Renderer side, `advance()`'s `finally` only clears `running` when the run is still live; an abandoned run therefore leaves `running` true until the dialog's open-effect resets it. There is no attempt identity shared with the main process — the renderer's `RunGuard` token is renderer-only, so main cannot tell a stale request from a current one.

## The fix

### 1. Attempt identity across the boundary
Every wizard run generates an `attemptId` (uuid) and passes it with each admin IPC call. `admin-pool.cjs` keeps a small registry: `{ attemptId, startedAt, stage, cancelled, deadline }`. A result whose `attemptId` is no longer current is discarded in main *and* ignored in the renderer. `cancel(attemptId)` cancels that attempt only (no argument = cancel whatever is current).

### 2. No unbounded await anywhere on the path
- Renderer: each step call is raced against a hard client deadline slightly above the main-process bound; on expiry the step becomes `timed_out` with the elapsed time, and the attempt is cancelled in the background.
- Main: `bounded()` is applied to every `sqladmin:*` channel, including `cancel`, `disconnect` and `status`, with short deadlines for the cheap ones.
- `admin-pool.cjs`: both post-handshake queries run through the existing `withDeadline` helper with `requestTimeout` set on the pool, so metadata and catalogue discovery cannot hang.

### 3. Cancellation actually frees everything
- On cancel/timeout: flag the run, clear the timer, drop `inFlight`, and attach a `.then(p => p.close())` to the abandoned `openPool` promise so the late pool is closed instead of leaking.
- `EBUSY` disappears as a user-visible outcome: a new attempt always supersedes the old one; the previous attempt is marked `cancelled` and its result dropped.
- Closing the dialog awaits nothing but always issues the cancel, resets `running`, and marks any running step `cancelled`.

### 4. Explicit step states
`StepStatus` becomes `idle | running | passed | failed | cancelled | timed_out`, replacing the current `stopped`, with matching icons and copy. Each step keeps `attemptId`, `stage`, `code`, `elapsedMs` and a safe message. The pipeline stops immediately on failure, cancellation or timeout.

### 5. Structured result shape
Admin calls return `{ ok, attemptId, stage, status, code, error, hint, elapsedMs, attempts[] }`. Diagnostic logging in main records attemptId, stage, elapsed ms and outcome only — never server strings with credentials, passwords or tokens.

## Files to change

- `electron/db/admin-pool.cjs` — attempt registry, per-query deadlines, orphan pool cleanup, cancel-by-id
- `electron/db/pool.cjs` — pass the cancellation check into the post-connect queries; no ladder changes
- `electron/main.cjs` — bound every `sqladmin:*` channel, forward attemptId, structured logging
- `electron/preload.cjs` — attemptId in the admin bridge signatures
- `src/lib/sql-admin.ts` — types for attemptId/status/elapsed
- `src/components/database/SqlConnectionModal.tsx` — attempt-scoped state machine, client deadlines, cancelled/timed-out rendering
- `src/lib/local-db.ts` — only where the write-verification call needs the same deadline treatment

Nothing in POS, sales, inventory, sync, permissions, schema or printing is touched.

## Tests (`src/lib/__tests__/local-db-connection.test.ts` plus a new wizard-state suite)

Successful run; login failure; database failure; handshake timeout; user cancellation; close while pending; reopen after cancellation; stale result from a previous attempt; double-click start protection; cleanup after timeout and after cancellation; lock release; no duplicate concurrent handshake; verify-write timeout; reset after a failed attempt. Full `bunx vitest run` at the end.

## Limitation

Cancelling a driver call that is already blocked in the OS socket layer cannot be proved in unit tests — the plan guarantees the attempt is *detached and released* at the deadline. End-to-end confirmation (Windows Integrated, SQL login, Browser service stopped) still needs a real Windows till.

Version bump to 1.3.14 with a note in `docs/offline-database-fix-report.md`.
