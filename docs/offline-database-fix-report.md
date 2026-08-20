# Offline database: connection, Lock & Save, and honest status

## Root cause of the spinning "Lock & Save"

`ipcMain.handle("pos:connect")` in `electron/main.cjs` did, in order:

1. `connectLocal(config)` — opened the SQL Server pool and immediately
   broadcast `pos:status-changed { connected: true }` to every window;
2. sealed and persisted the config;
3. `await initializeWorker(cloud)`, which ends in `await worker.run()` — a full
   cloud push/pull cycle, with no timeout.

The wizard's spinner stayed up until step 3 resolved, while every other panel
had already flipped to "Connected" in step 1. On a slow or unreachable cloud,
step 3 can take minutes, which is precisely the reported symptom: connected
everywhere, wizard still spinning. This is case **F** (a later initialisation
step hangs), with case **E** (state reported before completion) visible as the
mismatch.

## The real architecture (there are two stores, and they differ)

| Store | Code | Role |
| --- | --- | --- |
| SQL Server branch database | `electron/db/pool.cjs`, `repo.cjs` | Operational till database: sales, shifts, settings, backup, housekeeping, sync source |
| Embedded SQLite file | `electron/db/sqlite.cjs` (`userData`) | Catalogue mirror, sync audit ledger, settings fallback when SQL Server is down |

Only the first is configured by the wizard; the second is created at startup
unconditionally. Both are genuinely used, so neither was removed — they are now
labelled for what they are.

## Changes

**`electron/db/pool.cjs`** — added `verify()`: one round-trip
(`SELECT 1, DB_NAME(), @@SERVERNAME`) against the live pool. A pool object alone
is not evidence of a working database.

**`electron/main.cjs`**
- `connectLocal()` now connects **and verifies** before broadcasting connected.
  The boot reconnect and the backoff retry use the same path.
- `pos:connect` wraps the local connect in a 45 s deadline and returns
  `{ ok, verified, activeDb, serverName, latencyMs }` as soon as the local
  database is proved.
- The cloud sync worker is started fire-and-forget after the response; a failure
  is reported through `pos:status-changed` (`cloudError`) instead of blocking the
  wizard.

**`src/lib/local-db.ts`** — one state model:
`unavailable | not_configured | testing | saving | initializing | connected | failed`,
derived by `deriveLocalDbState()`. `connectLocalDatabase()` saves the sealed
config and calls the shell behind a 60 s `withIpcTimeout()`, so a dead IPC
channel becomes a failure rather than a permanent spinner.

**`src/components/database/SqlConnectionModal.tsx`** — the Lock step uses
`connectLocalDatabase()` and reports the database the shell actually landed in.

**`src/components/pos/LocalDatabaseSettings.tsx`** — rebuilt as: a status line
with a colour dot ("Local database connected" / "requires setup" /
"unavailable" / "Reconnecting…"), a single **Set up connection** entry point,
the backup button labelled with its target (the branch SQL Server database), and
a collapsed **technical details** block holding server, database, auth mode and
the schema panel. The legacy "Test connection" and "Save & connect" pair — a
second, unproven configuration path — has been removed. Passwords are never
rendered.

**`src/components/pos/sync/SyncHub.tsx`** — "Local database file" is now
"Offline mirror & audit file" with an explanation, and a new
"Operational database" field names the branch SQL Server and its state.

## Lock & Save flow now

```text
wizard -> pos:connect
  open pool -> verify round-trip -> seal config + JSON copy
  -> broadcast connected -> return { ok, activeDb }   [wizard closes here]
  -> (background) start cloud sync -> status broadcast
```

## Backup

"Back up branch database" runs `BACKUP DATABASE ... TO DISK` against the
configured SQL Server branch database — not the SQLite mirror. The button now
says so.

## Tests

`src/lib/__tests__/local-db-connection.test.ts` (11 cases, passing): verified
connect, refused connect, rejected IPC, IPC timeout, pending work never showing
as connected, saved-but-unreachable config, browser build, and setup-required.
Full suite and typecheck run clean.

## Remaining risk

The Electron main process cannot be launched in this environment, so
`pos:connect`, the boot reconnect and `BACKUP DATABASE` were verified by unit
tests against a stubbed bridge plus code tracing. The one step to run on a real
Windows till: connect, restart the app, confirm it reconnects without the wizard.

---

# Connection handshake and write verification (1.3.11)

## Why the wizard hung on "Auth handshake"

`sqladmin:connect` was the only administration channel without a deadline,
while behind it the connection ladder could walk up to 30 driver / route /
encryption combinations at 15 s each. The renderer awaited that with no
timeout and no cancellation, so the step could spin for many minutes. Closing
and reopening the dialog reset the step list but not the in-flight promise,
which then wrote its result into the fresh state.

## What changed

- Every attempt is bounded by our own clock (drivers do not reliably honour
  their own timeout): 8 s per attempt, 25 s for the whole ladder.
- Half-open pools are closed after every failed attempt, and the instance-name
  route is skipped once a port has been proven, which cuts the ladder down
  sharply in the common case.
- New `sqladmin:cancel` channel. The dialog cancels on close, and a **Stop**
  button cancels on demand — the running step is marked stopped, not failed.
- Every `sqladmin:*` handler is wrapped in a deadline, so a stuck driver comes
  back as a timeout result the operator can read.
- Results are guarded by a run token (`src/lib/run-token.ts`), so a promise
  from an abandoned run can never revive a spinner.

## Write verification

Signing in is not the same as being able to write, so a sixth step proves it
on the till's own pool: `BEGIN TRAN` → insert a probe row into
`dbo.pos_connection_health` → read it back → `ROLLBACK`. No real data is
touched and nothing is left behind. A login with read-but-not-write rights now
fails here instead of reporting a healthy connection.

## Tests

`src/lib/__tests__/local-db-connection.test.ts` gained cases for the missing
bridge, a successful write probe, a probe that never answers (timeout, not a
hang), a read-only login, and the three stale-run-guard behaviours.

## Still to confirm on a real till

Windows Integrated and SQL login, the SQL Server Browser service stopped, and
a read-only login failing cleanly at the write step.

---

# Named-instance and connection-status consolidation (1.3.12)

The repeated “No answer on that port” message was not reliable: renderer code
replaced any authentication timeout with firewall advice, even after the TCP
step had passed. Named instances added a second false negative because a stopped
SQL Browser service caused the probe to guess port 1433 although the native SQL
driver could still connect directly to `HOST\\INSTANCE`.

The TCP step is now advisory when a named instance has no advertised fixed
port, and the SQL driver handshake is authoritative. Failures retain their real
stage (port, instance lookup, driver, TLS, login, database or write), so login
and ODBC problems are no longer shown as firewall errors.

The green header badge now reads the operational POS pool—the same status used
by Local Database settings—instead of the temporary Database Explorer pool.
The Explorer pool remains isolated for safe schema browsing, but it cannot make
the till appear connected. SQL connection details now have one canonical
OS-encrypted main-process store; the old general-config copy is migrated once
and removed.
## 1.3.14 — connection wizard is a finite-state machine

- Every wizard run now carries an `attemptId` that crosses the IPC boundary, so the shell can cancel that exact attempt and a late result from a superseded run is discarded.
- Each step races the bridge call against a client deadline (`src/lib/connection-attempt.ts`); a lost reply becomes `timed_out`, never an endless spinner.
- Every `sqladmin:*` channel is bounded in `electron/main.cjs`, including `cancel`, `disconnect` and `status`.
- `connectInstance` bounds the post-login identification and catalogue queries, closes the pool of an abandoned attempt, and no longer answers `EBUSY` — a new attempt always supersedes the old one.
- Step states are explicit: `pending | running | passed | failed | cancelled | timed_out`, with a synchronous double-click lock on Run checks.
- Diagnostics log attempt id, stage, elapsed time and outcome only — never credentials.
