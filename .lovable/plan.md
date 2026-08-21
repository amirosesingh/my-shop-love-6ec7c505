# Phase 3 — Crash-proof Windows authentication and fresh connection control

The TCP check and authentication check prove different things. A fast open TCP port confirms that something is listening; it does not prove that Windows Integrated Authentication completed.

The confirmed crash boundary is the native `msnodesqlv8` Windows-auth driver running inside Electron's main process. Current deadlines only stop waiting for its Promise; they cannot stop the native ODBC call. Closing or replacing that pool while the native call is still running can terminate the whole Electron process. Direct mode itself is already Browser-free: with a port present it targets `host,port`, drops the instance suffix, and does not use UDP 1434.

## 1. Isolate Windows ODBC from the Electron process

- Add a dedicated SQL worker process for every Windows Integrated Authentication connection lifecycle.
- Load `mssql/msnodesqlv8` only inside that worker; the Electron main process must never load the native binding.
- Communicate over a small request/response protocol with attempt IDs, structured results, and no credentials in logs.
- A timeout or Stop action terminates the worker process, which is the only reliable cancellation boundary for a stuck native ODBC call. It must never call `close()` on an object whose native `connect()` is still in flight.
- Keep SQL Server Authentication on the existing pure-JavaScript `tedious` path.
- Route the admin handshake/catalog/lock flow and the operational Windows-auth pool through the isolated worker so a later query cannot reintroduce the same whole-app crash.
- If a worker exits unexpectedly, return a specific `EDRIVER_CRASH` result, keep the POS window alive, and allow an immediate clean retry.

## 2. Make direct Windows-auth attempts deterministic

- Normalize `PCNAME\SQLEXPRESS` plus an explicit port into one direct target: `PCNAME,port`; do not consult SQL Browser or retry by instance name.
- Pass `directConnect` through every typed bridge, including the direct operational test, so the Lock & Save step cannot silently fall back to automatic discovery.
- For direct mode, try one route and a bounded TLS sequence without overlapping attempts. Kill and recreate the worker between timed-out native attempts.
- Report the selected route and driver in the result: for example, `Windows Integrated · ODBC Driver 18 · PCNAME,port · SQL Browser not used`.
- Distinguish `TCP open` from `ODBC authentication timed out`, driver-process exit, login denial, TLS/certificate failure, and inaccessible database.

## 3. Stop saved configuration from taking over startup

- Do not synchronously open the saved SQL connection during Electron boot.
- Show the POS first, mark the app healthy, then start one background reconnect attempt after the renderer is ready.
- Keep the backoff loop cancellable and single-flight; removing a connection must terminate its SQL worker, clear timers, unlink the encrypted config, and prevent a stale callback from re-arming retries.
- A failed saved connection must leave the application usable and must never trigger the “POS did not start correctly” recovery screen.

## 4. Show and remove the saved connection everywhere it is edited

- Add a shared saved-connection summary to both Local database settings and the Setup Connection wizard.
- When a sealed connection exists, always show its server/instance, database, authentication type, connection mode, and port.
- Place **Remove saved connection** beside that summary in both surfaces, with the existing destructive confirmation.
- After removal, clear the form cache, active status, retry state, and step results, then present a genuinely fresh default form.
- Only show **Reconnect now** when a saved connection exists. In the wizard, edited values remain attempt-only until they succeed.

## 5. Add durable crash and connection diagnostics

- Add a rotating desktop log in Electron user data and send main-process lifecycle, SQL worker start/exit/timeout, attempt ID, stage, driver name, target, elapsed time, and sanitized error details to it.
- Persist admin-handshake traces to the same diagnostics stream instead of console-only output.
- Record `uncaughtException`, `unhandledRejection`, renderer termination, and child-process termination. Native worker crashes must include exit code/signal and the last safe stage.
- Keep credentials, connection strings, tokens, and passwords out of every log.
- Add **Open diagnostics folder** / **Copy latest connection report** actions to the local database failure UI; retain the recovery screen’s log-folder action.

## 6. Regression coverage and release

- Verify direct `PCNAME\SQLEXPRESS` + explicit port never performs UDP 1434 discovery and displays the actual ODBC driver used.
- Simulate a worker that hangs during authentication: the step times out, the worker is terminated, Electron remains alive, and retry succeeds with a new worker.
- Simulate a worker crash: return `EDRIVER_CRASH`, write diagnostics, and keep the renderer usable.
- Verify saved config does not block boot, is visible in both UI paths, and removal stops all retries and resets to `not_configured`.
- Verify SQL-login connections still use `tedious` and existing sale/sync transaction behavior remains intact.
- Run the focused connection tests and the full Vitest suite, then bump all generated/package versions together to `1.3.24`.

## Technical files

- New isolated worker and main-process proxy under `electron/db/`
- `electron/db/pool.cjs`, `electron/db/admin-pool.cjs`, `electron/main.cjs`, `electron/preload.cjs`
- `src/lib/local-db.ts`, `src/lib/sql-admin.ts`
- `src/components/database/SqlConnectionModal.tsx`
- `src/components/pos/LocalDatabaseSettings.tsx`
- Focused worker-crash, direct-route, startup, removal, and UI-state tests