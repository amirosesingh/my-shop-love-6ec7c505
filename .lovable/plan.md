# Stop the authentication handshake from crashing the till into the recovery screen

## Which driver the till actually uses (answer first)

Two different things are often mixed up. Neither is "the SQL Browser driver" — SQL Browser is only a lookup service, not a driver.

- **SQL Server login (username + password)** -> `mssql` on **tedious**, a pure JavaScript TDS client. It opens a direct TCP socket to `host,port`. No ODBC involved.
- **Windows Integrated authentication** -> `mssql/msnodesqlv8`, a **native ODBC** binding. It builds a connection string with `Driver={ODBC Driver 18 for SQL Server}` (falling back to 17, 13, SQL Server Native Client 11.0, then the generic "SQL Server" driver, ranked by what the Windows registry reports as installed).
- **SQL Server Browser (UDP 1434)** is used only when a named instance such as `localhost\SQLEXPRESS` is typed and no port is known. The wizard's TCP pre-flight resolves the port once and the handshake then connects by `host,port` directly, so with an explicit port the Browser service is never contacted.

So a direct local connection with a SQL login is fully tedious/TCP. Only Windows auth pulls in ODBC.

## Why it crashes into "POS did not start correctly"

Confirmed by reading the code:

- Windows-auth handshakes load `msnodesqlv8`, a native binary running **inside the Electron main process**. If that binary faults (missing/mismatched ODBC driver, bad VC++ runtime, driver-level abort), the whole main process dies instantly — a JavaScript `try/catch` cannot catch it.
- `main.cjs` registers **no** `uncaughtException`, `unhandledRejection`, `render-process-gone` or `child-process-gone` handler, so nothing survives such a fault.
- On launch, `app.whenReady()` calls `connectLocal(savedDbConfig)` — the same handshake — **before** the renderer reports `app:ready`. `health.beginBoot()` has already written `pending: true`. A crash there leaves the marker set; the next launch counts the failure, and after two, `shouldEnterSafeMode()` opens the recovery window. That is exactly the reported "handshake crashes, then POS did not start correctly".

## The fix

### 1. Handshake failures can never be boot failures
- Move the automatic reconnect on saved credentials to **after** the renderer reports `app:ready`, so the boot-health marker is already cleared before any driver work runs.
- Boot health gains a distinction between "UI never came up" and "a background task died": only the first counts toward safe mode.

### 2. The native driver runs where it cannot kill the till
- Windows-auth (msnodesqlv8/ODBC) connect attempts move into a short-lived **child helper process** (Electron `utilityProcess`, Node fallback in dev). The parent sends target + auth mode, the child answers with the winning attempt or a structured error, and the parent enforces the same per-attempt and ladder deadlines.
- A child that segfaults becomes a normal `EDRIVER`/`ECRASH` result with a clear message ("the ODBC driver crashed — install/repair ODBC Driver 18 for SQL Server, or use a SQL Server login"), not a dead application.
- Tedious (SQL login) keeps running in-process; it is pure JS and cannot fault this way.

### 3. Last-resort process guards
- `process.on("uncaughtException")` and `("unhandledRejection")` in main: log, record the reason, keep the window alive, broadcast a connection error to the UI.
- `render-process-gone` / `child-process-gone`: reload the window once instead of dropping straight into recovery; only a repeated failure escalates.

### 4. Honest reporting
- The recovery screen shows the recorded reason ("database driver crashed during connection") plus the existing "Try again" / "Resume updates" actions.
- The crash is appended to the rotating `connection.log`, with driver name, route and encryption — never credentials.
- The wizard's handshake step shows the driver actually used (tedious vs a named ODBC driver) on both success and failure, so this question never needs asking again.

## Files to change

- `electron/main.cjs` — post-ready auto-connect, process-level crash guards, renderer-gone recovery
- `electron/health.cjs` — separate background-crash reason from failed-launch counting
- `electron/db/pool.cjs`, `electron/db/admin-pool.cjs` — route native attempts through the helper, surface crash as a typed error, report the driver used
- `electron/db/odbc-connect-child.cjs` (new) — isolated native connect worker
- `electron/recovery.html` / `recovery.cjs` — show the recorded reason
- `src/lib/sql-admin.ts`, `src/components/database/SqlConnectionModal.tsx` — driver-used field and crash message
- Tests: boot health does not count a post-ready crash; a crashed helper yields a typed error instead of a rejection

No schema, business-logic or cloud changes. Version bumped and noted in the master documentation.
