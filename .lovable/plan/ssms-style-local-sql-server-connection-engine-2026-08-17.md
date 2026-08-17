# SSMS-style local SQL Server connection engine

## What you get

A single, reliable way to connect this terminal to a local Microsoft SQL Server, plus a built-in
database explorer: pick a server instance, see every online database, browse tables and their
columns, and run read-only queries. The connection stays open for the whole session and its state
is shown as a live badge in the app header.

## 1. Audit and cleanup

Today the connection logic is spread across three places that each build their own settings:
`LocalDatabaseSettings.tsx`, `SqlConnectionModal.tsx`, and the direct-probe path in `local-db.ts`.
The Electron side has `pos:test`, `pos:connect`, `pos:scan-network`, `db:scan-local-instances`
and `db:test-direct-connection` doing overlapping work.

- Keep one connection form (the modal), used by the settings panel and the new explorer page.
- Remove the duplicate inline server/port/auth inputs from the settings panel; it keeps the
  sync-status table, the connect/disconnect action, and a "Configure" button that opens the modal.
- Fold `db:test-direct-connection` into a single test path so there is only one probe.
- Drop unused preload bindings and any renderer-side connection attempt; every database call
  crosses IPC.
- No routes, themes, layout, or unrelated stores change.

## 2. Electron backend (main process only)

New module `electron/db/admin-pool.cjs`:

- One persistent `mssql` ConnectionPool per session, kept open until explicit disconnect or exit.
- Separate from the POS operational pool (`electron/db/pool.cjs`), so browsing never disturbs
  sales or sync. The operational pool keeps its current behaviour.
- Windows Authentication through `msnodesqlv8` with `trustedConnection: true`; the UI hides the
  user/password fields when Windows Auth is selected.
- `encrypt` and `trustServerCertificate` toggles exposed in the form.
- Auto-fallback: if the first attempt fails with a certificate/SSL error, retry once with
  `trustServerCertificate: true` and report that the fallback was used.
- Reuses the existing server-string parser (`localhost\SQLEXPRESS`, `.\SQLEXPRESS`, `HOST,1435`).

Two-phase connect:

1. Handshake against `master` on the chosen instance.
2. `SELECT name, state_desc FROM sys.databases WHERE state_desc = 'ONLINE' ORDER BY name` and
   return the list so the database dropdown and the explorer tree populate immediately.

Schema reads:

- Tables/views from `INFORMATION_SCHEMA.TABLES` for the selected database.
- Columns from `INFORMATION_SCHEMA.COLUMNS` fetched only when a table node is expanded
  (lazy loading, so a large database does not freeze the UI).
- Database context is applied per request with a validated, bracket-quoted `USE [db]`; the name is
  checked against the discovered list, never string-concatenated from raw input.

Query execution:

- Admin permission required, and the statement is validated read-only: single statement, must
  start with `SELECT` or `WITH`, and anything containing DML/DDL keywords is rejected with a clear
  message. Results are capped (e.g. 1000 rows) and returned as columns + rows.

## 3. IPC bridge

Added to `electron/preload.cjs` under a new `window.sqlAdmin` namespace, typed in
`src/lib/sql-admin.ts`:

- `connectInstance(credentials)` -> `{ ok, serverName, version, databases[], usedTrustFallback }`
- `listDatabases()`
- `getTables(dbName)`
- `getTableColumns(dbName, tableName)`
- `executeQuery(dbName, queryText)`
- `disconnect()`
- `status()` -> `{ connected, server, database }`

Each returns `{ ok: false, error, code, hint }` on failure rather than throwing.

## 4. Diagnostics and status badge

- Error codes are translated into plain instructions: TCP/IP disabled in SQL Server Configuration
  Manager, SQL Server Browser stopped (named instance not found), wrong `sa` password, firewall
  timeout, self-signed certificate, missing native driver.
- A small badge component (server name, selected database, connected/disconnected dot) renders in
  the existing app header next to the current status pills; it hides entirely in the web build.

## 5. UI

New admin-only page **Database Explorer** at `/settings/database-explorer`, linked from the
Diagnostics group of the settings hub:

- Left: connection card (Configure/Connect/Disconnect) plus the lazy tree
  Databases -> Tables/Views -> Columns.
- Right: query editor with a Run button, row count, execution time, and a results grid; shows a
  read-only notice and blocks non-SELECT statements before sending.
- Uses existing shadcn components and current theme tokens; on the web build the page shows the
  "desktop only" notice already used elsewhere.

## Verification

- Connect to `localhost\SQLEXPRESS` with Windows Auth and with a SQL login.
- Confirm the database list populates automatically, expanding a table loads its columns, and a
  `SELECT TOP 10` returns rows while an `UPDATE` is refused.
- Stop the SQL service and confirm the failure returns a readable reason within ~15s.
- Confirm sales and sync keep working while the explorer is connected.
