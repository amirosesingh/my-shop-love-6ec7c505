# Phase 3 — Crash-proof Windows Authentication via an isolated driver process

## What the current code does, and where it fights these requirements

| Current behaviour | Conflict |
| --- | --- |
| `pool.cjs` loads `mssql/msnodesqlv8` in the Electron main process and selects it for every Windows-auth attempt | The native ODBC call shares the process that owns every window, so a native fault takes the whole till down |
| `withDeadline` races a timer against the driver promise, then closes the pool object | The abandoned native `connect()` keeps running; closing underneath it is the crash pattern |
| The admin flow waits 1.5s for a cancelled run, then proceeds regardless | Two native calls can overlap on one target |
| No `uncaughtException` / `unhandledRejection` handler exists | Nothing contains an async native failure |
| Boot awaits the saved connection before the till reports healthy | A bad saved connection can end on the recovery screen |
| The operational connection test drops `directConnect` | The Lock step re-derives the target independently, which this work forbids |
| Direct mode already skips SQL Browser and instance lookup | Correct today — kept exactly as is |

`mssql` and `msnodesqlv8` are already unpacked in the packaged build, so a separate process can load them.

## 1. Isolated Windows-auth driver process

- New worker module that is the only place `mssql/msnodesqlv8` is ever loaded. It runs as a child process of the shell using the same executable in Node mode, so no extra runtime is required.
- The worker owns the whole Windows-auth lifecycle: handshake, catalog listing, database lock, and the operational pool used for sales and sync.
- The main process keeps a thin typed proxy exposing the same functions the app already calls, so callers do not change shape.
- SQL Server Authentication stays on the existing in-process `tedious` path, untouched.
- The main process must never require the native binding, directly or transitively.

## 2. Request/response protocol with attempt identity

- Every message carries an attempt ID, an operation name, and a payload.
- Replies are matched to in-flight attempts. A reply for an attempt that already timed out, was stopped, or belonged to a reaped worker is discarded and never written to app state.
- Credentials, connection strings, and passwords are stripped before anything is logged or broadcast; logs carry target, driver, stage, attempt ID, and timing only.
- Structured failure results distinguish authentication timeout, login rejection, TLS/certificate failure, missing driver, inaccessible database, and driver-process exit.

## 3. Cancellation by termination only

- Timeout or Stop terminates the worker process. Nothing tries to close or reuse a connection whose native call may still be running.
- After termination the attempt resolves as a terminal failure immediately, and a fresh worker serves the next attempt.
- The existing single-flight guard is replaced by attempt ownership, so a superseded run can never race a live one.

## 4. Session cleanup after a kill

- Terminating a worker skips TDS logout, so the server-side session can linger.
- Each attempt records its server session identifier as soon as the sign-in reports one.
- After a kill, a short-lived side-channel connection attempts to close that orphaned session when permissions allow.
- When cleanup is not possible the event is counted and logged. Accumulating kill-without-logout events raise a visible warning in the local database panel, so repeated retries cannot quietly exhaust server connections.

## 5. Crash handling and crash-loop protection

- An unexpected worker exit returns `EDRIVER_CRASH` with exit code and last safe stage. The POS window stays open and usable.
- Consecutive `EDRIVER_CRASH` results are counted per connection target. A success or a different failure resets the count.
- After three consecutive crashes on the same target, automatic retry stops and the UI shows a hard error naming the target and the likely cause, with manual retry only. This prevents a deterministic driver or connection-string fault from looping forever.
- The background reconnect loop respects that stop and does not re-arm itself.

## 6. Worker reuse and process caps

- A healthy worker is kept warm and reused for later attempts and for operational queries; only a crash, a kill, or a target change discards it.
- A hard cap limits concurrent worker processes. Requests beyond the cap queue rather than spawning more, so a burst of retries cannot flood the machine.
- Workers are terminated on app shutdown, on connection removal, and when idle beyond a bounded lifetime.

## 7. One canonical direct target

- A single normalizer converts server text, instance name, and port into one direct target of the form `HOST,PORT`, dropping the instance suffix.
- That resolved target — not the raw form values — flows through the port probe, handshake, catalog, lock, and operational connection. No layer re-derives it.
- The typed bridges carry `directConnect` and the resolved target end to end, including the operational connection test that currently loses it.
- SQL Browser and instance-name fallback remain unused in direct mode.
- Results state the exact route used, for example `Windows Integrated · ODBC Driver 18 · PCNAME,1433 · SQL Browser not used`.

## 8. Migration audit before rollout

- A startup audit inspects the stored connection: a named instance without a pinned port is reported as needing attention, because dynamic-port discovery is not available on the direct path.
- The local database panel shows a clear, actionable notice for such a configuration and offers to pin the port through the wizard, rather than failing silently at first sale.
- The audit result is written to diagnostics so a fleet can be checked from logs.

## 9. Startup, diagnostics and safety net

- Boot no longer waits on SQL: the till renders and reports healthy first, then one background attempt runs.
- Global handlers capture uncaught errors, unhandled rejections, and child-process exits, writing them to a rotating diagnostics log in application data alongside the existing connection log.
- The failure UI gains actions to open the diagnostics folder and copy the latest sanitized connection report.

## 10. Tests and release

- Direct `PCNAME\SQLEXPRESS` plus a port resolves to one `PCNAME,PORT` target with no Browser lookup, identically across probe, handshake, lock, and operational paths.
- A worker that hangs during authentication is killed; the step fails cleanly, the app stays alive, and the next attempt succeeds on a fresh worker.
- A late reply from a reaped attempt is discarded and cannot alter state.
- Three consecutive crashes on one target stop automatic retry and surface a hard error; a success resets the counter.
- Worker reuse holds across sequential attempts, and the concurrency cap is never exceeded.
- Session-kill accounting increments and warns as designed.
- A named instance without a port is flagged by the migration audit.
- SQL-login connections still use `tedious`, and sale/sync transaction behaviour is unchanged.
- Full Vitest suite, then a coordinated version bump to `1.3.24`.

## Technical files

- New: isolated Windows-auth driver worker, its main-process proxy, protocol types, crash-loop tracker, session-cleanup helper, and target normalizer under `electron/db/`
- Updated: `electron/db/pool.cjs`, `electron/db/admin-pool.cjs`, `electron/main.cjs`, `electron/preload.cjs`
- Updated: `src/lib/local-db.ts`, `src/lib/sql-admin.ts`
- Updated: `src/components/database/SqlConnectionModal.tsx`, `src/components/pos/LocalDatabaseSettings.tsx`
- New tests for target normalization, attempt-ID discard, crash-loop limits, worker reuse, and the migration audit
