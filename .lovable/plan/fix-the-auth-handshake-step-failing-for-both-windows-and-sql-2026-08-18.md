# Fix the "Auth handshake" step failing for both Windows and SQL logins

## What the code actually does today (verified)

- The wizard's socket step (`probePort` in `electron/db/admin-pool.cjs`) opens a plain TCP socket to the **port only** — for `localhost\SQLEXPRESS` with no port typed, that is 1433. So step 2 can pass even when the named instance is somewhere else entirely.
- The handshake step (`connectInstance` -> `buildConfig`) then throws the instance name back at the driver, so the driver resolves the instance over **SQL Server Browser (UDP 1434)** instead of using the port that was just proven open. If Browser is stopped, this fails regardless of which authentication is picked — matching "credentials OK, socket OK, handshake fails, both auth modes".
- Windows Integrated cannot work at all in the current build: `admin-pool.cjs` (and `pool.cjs`) do `require("mssql")`, which is the tedious build, and then set `config.driver = "msnodesqlv8"` plus a `connectionString`. The tedious build ignores both. mssql only uses the native driver when the module is loaded as `mssql/msnodesqlv8`. The result is a tedious connection with no user and no password -> login rejected at the handshake.
- The ODBC connection string is pinned to `Driver={ODBC Driver 17 for SQL Server}`. On a SQL Server 2025 machine, driver 18 is the one usually installed, so even the native path would fail with "data source name not found".
- The certificate retry in `openPool` only fires when trust was already turned **off**; with encryption on and trust on there is no fallback to an unencrypted local connection.

## Fix

### 1. Load the right driver for Windows Integrated
`electron/db/admin-pool.cjs` and `electron/db/pool.cjs` load `mssql/msnodesqlv8` when auth is Windows and `msnodesqlv8` resolves, and plain `mssql` otherwise. For the native path pass **only** a connection string (no tedious-shaped `server`/`options` mix), and probe the installed ODBC driver in order: `ODBC Driver 18`, `17`, `13`, then `SQL Server Native Client 11.0`, falling back to the plain `SQL Server` driver.

### 2. Use the port the socket step already proved
- Extend the socket step so it reports the port it succeeded on, and — when an instance name is present — also queries SQL Browser on UDP 1434 to learn the instance's real port.
- Pass that resolved port to the handshake and connect by `host,port` instead of by instance name whenever a port is known. Instance-name resolution stays as the last resort.
- When Browser is off and no port is known, the step fails with a named cause instead of a generic timeout.

### 3. Handshake retry ladder
Attempt in order, stopping at the first success, and report which combination worked:
1. as configured,
2. encryption on + trust certificate on (self-signed local cert),
3. encryption off (typical local Express instance).
Applies to both auth modes.

### 4. Show the real reason
The handshake result carries `code`, the driver's original message, the attempted target (`host,port` / instance, auth mode, encryption, driver used) and the plain-language hint. The wizard step renders that block instead of a one-line message, so the next failure is self-explanatory. Common cases get specific text: mixed-mode authentication disabled, login has no server access, ODBC driver missing, Browser service stopped, wrong instance.

### 5. Same treatment for the operational pool
`pool.cjs` shares the driver loader, the port resolution and the retry ladder, so "Connect & Save" cannot succeed in the wizard and then fail for the till.

## Files touched

- `electron/db/pool.cjs` — driver loader, ODBC driver probing, port resolution, retry ladder
- `electron/db/admin-pool.cjs` — same, plus richer diagnostics returned to the renderer
- `electron/db/discover.cjs` — UDP 1434 instance-to-port lookup reused by the socket step
- `src/components/database/SqlConnectionModal.tsx` — pass the resolved port forward, render the detailed failure block
- `src/lib/local-db.ts` / `src/lib/sql-admin.ts` — types for the extra result fields

No schema, business logic or cloud changes.
