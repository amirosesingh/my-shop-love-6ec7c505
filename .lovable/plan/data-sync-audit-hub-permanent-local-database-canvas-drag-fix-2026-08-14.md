# Data Sync & Audit Hub, permanent local database, canvas drag fix

## What the inspection found

- **Connection settings** are sealed with the operating system's encryption into `userData/local-db-config.bin` (`electron/db-config-store.cjs`) and re-read on boot (`electron/main.cjs`, app-ready). They do persist — but only when OS encryption is available; if it is not, the write is skipped with a console warning and the till silently starts unconfigured next launch. There is also no "Reset / Erase configuration" action anywhere in Settings.
- **Device settings** (`settings:get` / `settings:set`) are stored *inside the SQL Server database*, not on disk. When SQL Server is unreachable, every device setting read fails — this is the real "settings lost after restart / disconnect" symptom.
- **There is no embedded local database.** Offline data lives either in a remote-but-local **SQL Server** instance (`electron/db/pool.cjs`, `mssql` / `msnodesqlv8`) or, in the browser build, a localStorage snapshot. No SQLite file, no ORM, no dialect-safety layer.
- **Sync locking:** the Electron worker has a `running` guard, but the browser sync engine (`src/lib/sync-engine.ts`) has none, and both react to `online` events instantly — no debounce, so a flapping Wi-Fi triggers repeated cycles.
- **Canvas drag:** the register canvas renders a fixed logical grid inside `transform: scale(...)` and hands react-grid-layout `createScaledStrategy(metrics.scale)`. The scale is accounted for, but the pointer origin is not re-based against the scaled container, so the grab point is not locked and the item jumps on drag start.
- No `/settings/data-sync` route exists; sync UI today is a small pill plus `SyncSettings` inside Settings > Sync & backup.

## What will be built

### 1. Permanent configuration file

- New `pos_config.json` in the app data folder, written and read through IPC. Encrypted with OS encryption when available, plain JSON with restricted file permissions when it is not, so a config is **never** lost because encryption was unavailable.
- Holds connection details, credentials, local database path and device settings. Device settings read from this file first and use SQL Server only as a mirror, so a database outage can no longer wipe them.
- Nothing clears it on restart, reload or network loss. A new **Reset / Erase configuration** button in Settings (admin only, typed confirmation) is the single way to remove it.

### 2. Embedded local database engine

- A real database file at `userData/local_pos_database.db` using SQLite through a query builder so the same statements work against SQLite locally and PostgreSQL in the cloud.
- **Online:** writes go to the cloud first, and catalogue, products, barcodes, customers, service jobs and settings are mirrored down into the local file continuously.
- **Offline:** queries switch automatically to the local file, so scanning, tickets, deposits and sales keep working. The existing SQL Server option stays supported for branches already using it; SQLite becomes the default when no SQL Server is configured.
- Conflict rules: catalogue and settings are **server-wins** on pull; sales, payments and service tickets are **append-only** — created offline with client UUIDs and UTC timestamps, inserted as new cloud rows, never overwritten by a pull.

### 3. Network flap protection

- Five-second debounce on every network state change before a sync cycle starts, plus a single sync mutex shared by push and pull in both the Electron worker and the browser engine, so only one cycle ever runs.

### 4. Data Sync & Audit Hub (`/settings/data-sync`)

- **Header badge** (replacing today's pill): green fully synced, amber syncing with live push/pull counts, orange offline with pending count, red sync error.
- **Live counters** comparing cloud versus local record counts for products, barcodes, customers, service jobs, payment ledgers and settings.
- **Push card** (local to cloud) listing pending sales, jobs and stock counts with a **Force Push Now** button; **Pull card** (cloud to local) for catalogue, prices and settings with **Force Refresh / Pull All**.
- **Progress bar** showing the entity and percentage during a cycle.
- **Audit ledger table**: timestamp, direction, entity, record id, records processed, status, error message. Failed rows highlighted with a **Retry Record** button.
- The ledger is persisted (local database plus the existing sync log) so overnight failures survive a restart.

### 5. Canvas drag coordinate fix

- On pointer down, measure the canvas container with `getBoundingClientRect()`, convert the cursor to canvas space by subtracting the container origin and pan offset and dividing by the zoom scale, and lock the grab delta against the element's position. The element then stays exactly under the cursor for the whole drag, at any zoom or monitor size.

## Technical notes

- New: `electron/config-store.cjs` (pos_config.json, encrypted-or-plain with a documented fallback), `electron/db/sqlite.cjs` (engine + schema + migrations), `src/lib/sync-audit.ts` (ledger), `src/routes/settings.data-sync.tsx`, `src/components/pos/SyncHub.tsx`.
- Changed: `electron/main.cjs` (config IPC, engine selection, reset handler), `electron/preload.cjs` (new channels), `electron/sync/worker.cjs` (debounce, shared mutex, per-record audit rows, retry-one), `electron/db/repo.cjs` (dialect-safe queries), `src/lib/sync-engine.ts` (mutex + debounce + progress reporting), `src/lib/sync-status.ts` (push/pull counts, progress, error), `src/components/pos/SyncStatus.tsx` (four-state badge), `src/components/pos/LocalDatabaseSettings.tsx` (reset/erase), `src/components/pos/layout/RegisterWorkspace.tsx` (pointer maths).
- Dependencies: `better-sqlite3` plus a lightweight query builder, rebuilt for Electron in the desktop packaging workflow. SQLite is desktop-only; the browser build keeps its snapshot fallback and the Hub shows local counts as "desktop only" there.
- Nav entry added under Settings, and the Hub is permission-gated to supervisors/admins.
- Version bump with the release.