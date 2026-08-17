# Multi-Location POS & Central Warehouse — Wizard, Schema Lifecycle, Routing

## 1. Step-by-step SQL Server connection wizard

Rebuild `src/components/database/SqlConnectionModal.tsx` as a 5-step wizard with a visible
progress rail. Today it is a single form that runs one combined test; the new flow shows each
phase's result and stops at the first failure with an actionable message.

```text
[1] Credentials  ->  [2] TCP socket  ->  [3] Auth handshake  ->  [4] Catalog scan  ->  [5] Lock & save
     inputs            2s port probe      master, trusted or       sys.databases        pool to target
                                          SQL login                dropdown             + save settings
```

- Step 1 — Host (default `localhost`), TCP port (default `1433`), auth mode. Username/password
  inputs are disabled and cleared while Windows Authentication is selected. Button: "Start
  Connection Test".
- Step 2 — raw TCP probe with a 2-second timeout. Failure text names the port, the host and points
  at SQL Server Configuration Manager. Success renders "Step 1 Complete: Server port socket
  reachable".
- Step 3 — connect to `master`. Windows Auth omits `user`/`password` entirely and uses the trusted
  `msnodesqlv8` path; SQL Auth passes both. Failure text: authentication rejected.
- Step 4 — run the ONLINE + `HAS_DBACCESS` catalog query and fill the Target Database dropdown,
  showing the count scanned.
- Step 5 — operator picks the database, "Connect & Save" validates a pool against that database and
  persists host, port, auth mode and database name to local app settings.

Each completed step stays on screen with a tick, its own detail line, and a "Start over" action.

## 2. Single master schema file and passive startup

- Move the local schema to `database/schema.sql` as the one structure-only file: tables, keys,
  indexes and constraints, no `INSERT`, no seed rows. It gains the location-hierarchy columns
  (`parent_location_id`, `location_type`, `is_central`, `building_name`, `floor_label`,
  `is_active`, `archived_at`) and the sale store-name/address snapshot columns.
- Startup becomes passive: connecting no longer runs the schema. The app only probes the
  connection and reports what it found.
- Schema application moves behind an explicit button in Local Database settings ("Review & apply
  schema") that shows the file, what is missing, and applies only when the operator clicks. This
  keeps existing desktop installs upgradable without any automatic write.
- Audit pass over the write layer to confirm no insert/update/delete is triggered by boot,
  by a route mount, or by a background timer — only by user actions.

## 3. Central-first inbound routing and sub-warehouse hierarchy

- Receiving in Purchasing enters through the Central Hub context. When no central hub is nominated,
  the screen asks the operator to pick one instead of silently defaulting.
- After the invoice is captured, a destination step resolves the put-away target: one sub-location
  auto-selects, several reveal a Target Selector (`Central Hub -> Ground Floor Outlet | 2nd Floor
  Vault | Annex Storage`). Branches with no children receive into themselves.
- Stock movement runs as a single atomic write that debits the hub and credits the target together,
  so a partial move cannot be left behind.
- Location metadata (name, address, building, floor, parent) stays editable at any time; historical
  bills already carry their own store-name snapshot, so renames never rewrite past reports.

## 4. Boot check and pool separation

- A `LocationBootGuard` wraps the app shell: it counts active locations once data is ready and, at
  zero, blocks registers behind a modal reading "No active store or warehouse found. Please create
  your primary location to continue." with a single action into the Location Setup screen.
- `posPool` stays exclusively for register traffic; `adminExplorerPool` stays for schema browsing.
  The admin validator is tightened to accept only a single `SELECT`/`WITH` statement and reject
  `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, multi-statement text and comment
  tricks, both in the renderer pre-check and in the main process.

## Technical notes

- Files: `src/components/database/SqlConnectionModal.tsx` (wizard), `src/lib/local-db.ts` and
  `electron/preload.cjs` (new `probePort`, `probeAuth`, `listDatabases`, `lockDatabase` steps),
  `electron/db/pool.cjs` (drop auto `applySchema`, add explicit apply + `node:net` probe),
  `database/schema.sql` (new home), `src/components/pos/LocalDatabaseSettings.tsx` (apply-schema
  panel), `src/routes/purchasing.tsx` and `src/lib/locations.ts` (routing), a new
  `src/components/pos/LocationBootGuard.tsx` mounted in `AppShell`, and
  `electron/db/admin-pool.cjs` plus `src/lib/sql-admin.ts` (validator).
- The TCP probe uses `node:net` in the main process, so it reports firewall problems before the
  driver's slower generic timeout.
- Web builds keep working: every wizard step degrades to the existing "desktop only" result.
