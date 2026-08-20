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