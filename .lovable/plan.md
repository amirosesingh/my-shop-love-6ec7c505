# Fix the stuck "Auth handshake" step and prove the database is writable

## What the code actually does today (verified by reading it)

- `sqladmin:connect` in `electron/main.cjs` is registered as
  `ipcMain.handle("sqladmin:connect", (_e, c) => sqlAdmin.connectInstance(c))` — **no deadline**.
  By contrast `pos:connect` is wrapped in `withTimeout(..., 45s)`. So the handshake step is the one
  step in the wizard that can wait forever.
- `openConnection` in `electron/db/pool.cjs` walks a combinatorial ladder:
  installed ODBC drivers (up to 5) x route (port / instance name) x security combos (up to 3).
  For Windows authentication that is up to **30 attempts, each with a 15-second connect timeout** —
  over seven minutes of "Loading…" before any answer comes back. On a stalled TCP path the driver
  burns the full timeout on every attempt, so in practice it looks infinite.
- The renderer (`runHandshake` in `SqlConnectionModal.tsx`) awaits that IPC call with no timeout and
  no cancellation. Closing the dialog does not abort anything.
- Re-opening the dialog runs an effect that resets `steps` but **not** `running`, and the still
  in-flight first call later writes into state. That is the "reopen shows Run Checks but stays stuck"
  symptom. Nothing stops a second click from starting a second ladder, and `connectInstance` begins
  with `await disconnect()`, so two concurrent runs close each other's pool.
- There is **no write verification** anywhere. The final step only runs SELECTs
  (`lockDatabase`, `testDirectConnection`, `pool.verify()`), so "connected" never proves the login
  can actually insert.

## Fix

### 1. Bound every attempt and the whole handshake (main process)
- `openConnection` gets a per-attempt deadline (the configured connect timeout, enforced by the
  caller rather than trusted from the driver) and an **overall budget** (~25s). When the budget is
  spent it stops the ladder and throws a timeout error carrying the attempts already tried.
- Trim the ladder honestly instead of brute force: probe the ODBC drivers once and only walk to the
  next driver when the failure really is "driver not installed"; skip the instance-name route when a
  port is already known to work.
- Wrap `sqladmin:connect`, `sqladmin:lock`, `sqladmin:probe-port` and `sqladmin:databases` in the
  existing `withTimeout` helper so an IPC call always resolves with `{ ok:false, code:"ETIMEOUT" }`
  rather than hanging.

### 2. Single in-flight handshake, cancellable
- `admin-pool.cjs` keeps one in-flight connect promise keyed by an attempt id. A second
  `connectInstance` while one is running returns a clear "a connection attempt is already running"
  result instead of tearing down the first.
- New `sqladmin:cancel` channel: closes the half-open pool and rejects the in-flight attempt.
  The wizard calls it when the dialog closes mid-run.

### 3. Explicit state machine in the wizard
Each step becomes `pending -> running -> passed | failed | timed_out | cancelled`, with a run token:
results from a superseded or cancelled run are discarded instead of writing into fresh state.
On close the wizard cancels the run, resets `running`, and clears step state; on reopen it always
starts from a clean cycle. The "Run checks" button is disabled only while a run genuinely owns the token.

### 4. New "Write verification" step
A new final step after Lock & save, run against the **operational** pool (the same
`electron/db/pool.cjs` connection the till uses — not the admin pool), through a new
`pos:verify-write` IPC:

```text
BEGIN TRAN
  CREATE TABLE #pos_write_check(id int)   -- or insert into the existing health row
  INSERT ... ; SELECT back the row
ROLLBACK
```

Concretely: open a transaction, insert a probe row into a dedicated
`dbo.pos_connection_health` table (created only if absent by the existing schema apply path;
falls back to a temp-table probe when the table is missing), read it back, then roll back so no
customer or sales data is touched. Failure surfaces as
`Database write verification failed — <reason>`, distinct from an authentication failure.

### 5. Honest per-step results
Each failed step shows one of: `Authentication failed`, `Authentication timed out`,
`Socket closed before authentication response`, `No suitable ODBC driver`,
`Database write verification failed`, plus the driver code and the combinations tried.
Passwords and connection strings are never included in the surfaced text or in logs.

### 6. Persistence unchanged
Only after handshake, catalog, lock and write verification all pass is the config sealed through the
existing encrypted store. Reopening the wizard shows the saved connection as already healthy.

## Files to change

- `electron/db/pool.cjs` — per-attempt deadline, overall budget, tighter ladder, write-probe helper
- `electron/db/admin-pool.cjs` — single in-flight attempt, cancel support, timeout-aware diagnostics
- `electron/main.cjs` — `withTimeout` on the `sqladmin:*` channels, `sqladmin:cancel`, `pos:verify-write`
- `electron/preload.cjs` — expose `cancel` and `verifyWrite`
- `src/lib/sql-admin.ts`, `src/lib/local-db.ts` — types for the new results and channels
- `src/components/database/SqlConnectionModal.tsx` — run tokens, cancel-on-close, sixth step, richer failure block
- `src/lib/__tests__/local-db-connection.test.ts` (+ a new wizard-state test) — timeout, cancellation,
  reopen, duplicate-run and write-verification cases

## Tests

Extend the existing Vitest suite: handshake success chain through write verification; timeout path;
rejected credentials; socket close; cancel-on-close leaves no stale state; a second Run Checks does
not start a second attempt. No test bypasses the handshake logic.

No schema, business-logic or cloud changes.
