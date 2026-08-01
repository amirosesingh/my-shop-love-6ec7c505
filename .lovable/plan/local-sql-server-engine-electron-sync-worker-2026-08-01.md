# Local SQL Server engine + Electron sync worker

Move the till's source of truth from browser storage to a Microsoft SQL Server
instance running on the same Windows machine, with the Electron main process
owning the database connection and a background worker syncing both ways with
the cloud.

## What exists today

- Writes already go through a serialisable operation queue (`src/lib/sync-outbox.ts`)
  persisted in `localStorage`, drained in order by `src/lib/sync-engine.ts`.
- Settings already has a Sync & backup tab with an Online Sync toggle, an outbox
  inspector, manual push and a SQL export.
- There is no Electron shell in the project yet; `docs/windows-desktop.md`
  describes the intended packaging path.

Because every write is already an operation object, swapping the storage layer
behind it is a substitution, not a rewrite of the app.

## What gets built

### 1. Electron shell

```text
electron/
  main.cjs        window(s), lifecycle, IPC registration
  preload.cjs     contextBridge -> window.pos (db, sync, printer, net)
  db/pool.cjs     mssql connection pool (config from user settings)
  db/schema.sql   local schema, MERGE-ready
  db/repo.cjs     read/write helpers per table
  sync/worker.cjs push + pull routines, timers, backoff
```

- Primary window loads the till; a second window opens `/display` on the
  secondary monitor when one is detected.
- `contextIsolation: true`, `nodeIntegration: false`; the renderer only ever
  reaches SQL Server through IPC.

### 2. Local schema (T-SQL)

Every table carries the standard sync block:

```sql
id           UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
is_synced    BIT              NOT NULL DEFAULT 0,
sync_status  NVARCHAR(20)     NOT NULL DEFAULT N'pending',
created_at   DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
updated_at   DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
```

Applied to: `products`, `members`, `membership_tiers`, `sales`, `sale_items`,
`purchase_orders`, `purchase_order_items`, `promotions`, `shifts`, `bookings`,
`booking_payments`, `transfers`, `pos_settings`, `audit_logs`. Ids are generated
in the app (UUID v4) rather than by the server, so a record keeps the same key
locally and in the cloud. An AFTER UPDATE trigger per table refreshes
`updated_at` and flips `is_synced` back to 0 on edit. An index on
`(is_synced, created_at)` keeps the push query cheap.

### 3. Data layer swap

`src/lib/pos-db.ts` keeps its current function signatures. Behind them a new
`src/lib/local-db.ts` picks a backend at runtime:

- Electron present (`window.pos`): every write becomes a parameterised T-SQL
  statement executed over IPC inside a transaction, returning immediately.
- Browser (no Electron): the existing localStorage outbox, unchanged, so the web
  build and the preview keep working.

### 4. Sync worker (main process)

Runs on a timer plus network events, gated by the existing Online Sync toggle
(the renderer forwards toggle changes over IPC) and by `navigator.onLine` plus a
main-process reachability probe.

- Push: `SELECT TOP (n) ... WHERE is_synced = 0 ORDER BY created_at` per table in
  dependency order (parents before children), batched into
  `supabase.from(table).upsert(rows, { onConflict: 'id' })`, then
  `UPDATE ... SET is_synced = 1, sync_status = 'synced' WHERE id IN (...)`.
  Failures set `sync_status = 'error'` with the message and an attempt counter;
  after repeated failures the row becomes `'quarantined'` and is listed in the UI.
- Pull: catalogue tables only (products, tiers, promotions, settings) filtered by
  `updated_at > last_pulled_at`, applied with a T-SQL `MERGE` so inserts and
  updates land in one pass. Pull never touches transactional tables, so a cloud
  read cannot overwrite an offline sale.
- Conflict rule: catalogue rows resolve last-write-wins on `updated_at`;
  transactional rows are insert-only with local UUIDs and therefore cannot collide.

### 5. Settings UI additions

The Sync & backup tab gains a "Local database" section: server/instance, database
name, auth mode (Windows or SQL login), a Test connection button, live counters
(pending / synced / errored per table), last push and last pull times, a manual
"Pull catalogue now" button, and a T-SQL backup export
(`BACKUP DATABASE ... TO DISK`). Connection credentials are stored through the
existing encrypted secure-settings mechanism, never in the renderer.

## Notes

- SQL Server access only exists inside the packaged Windows app. In the browser
  preview the same screens run against the current localStorage outbox and the
  local-database section shows as unavailable — expected, not a bug.
- The cloud schema stays as it is; the local schema mirrors it column-for-column
  plus the sync block, which is what makes the batch upsert a straight
  pass-through.