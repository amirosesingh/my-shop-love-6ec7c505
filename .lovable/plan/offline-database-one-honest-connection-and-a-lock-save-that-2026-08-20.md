# Offline Database: one honest connection, and a Lock & Save that finishes

## What the trace actually found

Flow followed end to end: Sync & backup -> `SyncSettings` -> `LocalDatabaseSettings` ->
`SqlConnectionModal` (5-step wizard) -> `pos:connect` IPC -> `electron/main.cjs`
`connectLocal()` -> `electron/db/pool.cjs` (SQL Server) -> `repo.cjs` for every POS
write. Separately, `electron/db/sqlite.cjs` is initialised unconditionally at app start.

### There really are two local stores, and they are not the same thing

1. **SQL Server branch database** (`pool.cjs` + `repo.cjs`) — the operational till
   database: `pos:write`, settings, backup (`BACKUP DATABASE ... TO DISK`),
   housekeeping and the sync worker all use it. Configured by the wizard, persisted
   twice (`db-config-store.cjs` sealed blob and `config-store.cjs` JSON), reconnected
   on boot.
2. **Embedded SQLite file** (`sqlite.cjs`, in `userData`) — always created, never
   configured. Holds the catalogue mirror, the sync audit ledger, and a fallback for
   device settings when SQL Server is down.

So the UI is not lying about two databases existing — it fails to say that one is the
operational database and the other is a mirror/ledger. The Sync hub prints
"Local database file: C:\Users\..." (the SQLite mirror) beside an engine status, while
Sync & backup shows "Set up connection" for SQL Server. Two panels, two engines, no labels.

### Second problem: the pre-wizard controls are still there

`LocalDatabaseSettings` offers the wizard **and** a legacy "Test connection" +
"Save & connect" pair writing the same config by a different path. That is the duplicate
configuration surface, and it can save a config the wizard never proved.

### Root cause of the spinning "Lock & Save"

`ipcMain.handle("pos:connect")` does, in order: `connectLocal(config)` (opens the pool and
immediately **broadcasts connected**), seals the config, then `await initializeWorker(cloud)`
which ends in `await worker.run()` — a full cloud push/pull cycle with no timeout.

The wizard spinner stays up until that IPC resolves, but the status broadcast has already
flipped every other panel to "Connected". With a slow or unreachable cloud, `worker.run()`
can take minutes — exactly the reported symptom: connected everywhere, wizard still spinning.
Case F (a later initialisation step hangs), with Case E visible as the state mismatch.

## What will be changed

### 1. `pos:connect` returns when the local database is ready
- Open the pool, verify with a real round-trip (`SELECT 1`, `DB_NAME()`), seal and persist
  the config, then return `{ ok: true, activeDb, verified: true }`.
- The cloud sync worker starts **fire-and-forget** after the response, not awaited; its
  outcome arrives through the existing `pos:status-changed` broadcast, so sync problems no
  longer block database setup.
- The connected broadcast moves to *after* verification, so no panel reports connected
  before the pool is usable.
- An overall timeout on the handler: on timeout it returns a real failure instead of never
  resolving.

### 2. Explicit connection state model
`src/lib/local-db.ts` gains one state:
`not_configured | testing | saving | initializing | connected | failed | unavailable`,
derived in a single place from shell status plus persisted config. Panels read that state
instead of combining `busy` / `connected` / `phase` booleans, so the spinner has exactly one
owner and always stops — on success and on failure.

### 3. Offline Database status card (user-facing wording)
`LocalDatabaseSettings` is rebuilt as four separated blocks:
- **Status** — a dot plus one line: "Local database connected" / "Local database requires
  setup" / "Local database unavailable" / "Reconnecting…". No filesystem path or server
  string in the headline.
- **Setup** — the single "Set up connection" button (wizard only; the legacy Test /
  Save & connect pair is removed, since the wizard already performs and proves both steps).
- **Backup** — the existing local backup button, labelled with what it writes: the SQL Server
  branch database, via `BACKUP DATABASE`.
- **Details (collapsed)** — server, instance, database name, auth mode, mirror file path,
  engine versions. Passwords are never rendered or logged.

### 4. Naming the two stores honestly
In the Sync hub, "Local database file" becomes **"Offline mirror & audit file"** with a short
explanation, and a new field states the operational database (SQL Server, database name,
connected/unavailable). Nothing is deleted: the mirror is genuinely used, it just stops
masquerading as the POS database.

### 5. Restart and persistence
Boot already reads sealed-then-JSON config. It will additionally re-verify with the same
round-trip before broadcasting connected, and report `unavailable` (not `connected`) while
the reconnect backoff runs.

### 6. Failure handling
Each wizard step and the status card surface: test failed, save failed, initialisation
failed, IPC failed/timed out, and "configured but unreachable". No path leaves the UI
spinning; failures never render as connected.

## Tests

New `src/lib/__tests__/local-db-connection.test.ts` plus additions to existing suites, with a
stubbed `window.pos`:
- save + verify + initialise -> `connected`, spinner cleared;
- verification failure, save failure, IPC rejection, IPC timeout -> `failed`, spinner cleared,
  no connected status;
- cloud worker failure after a good local connect -> still `connected`, sync error reported
  separately;
- persisted config on reload -> `connected` without re-running the wizard;
- only one operational database identifier is ever reported as active.

## Files to change

`electron/main.cjs` (pos:connect lifecycle, verified connect, non-blocking worker start, boot
verification), `electron/db/pool.cjs` (verification probe), `src/lib/local-db.ts` (state model
+ typed result), `src/components/pos/LocalDatabaseSettings.tsx` (rebuilt card),
`src/components/database/SqlConnectionModal.tsx` (lock step consumes the new result),
`src/components/pos/sync/SyncHub.tsx` (mirror vs operational labels), plus the tests above.

## Report

A full report — root cause, real architecture, changes, UI, Lock & Save flow, backup target,
tests run, remaining risks — will be written to `docs/offline-database-fix-report.md`.

## Note on verification

The Electron main process cannot be launched here, so `pos:connect` will be verified by
typecheck, unit tests against a stubbed bridge, and code-level tracing; the on-Windows
restart test is the one step you will need to run on a real till.