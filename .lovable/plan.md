# Settings as real pages + offline SQL Server checkout + branch sync log

## 1. Settings become separate pages

Today every settings area is one long accordion on `/settings`, so opening "Display & Text Size" from the sidebar scrolls you into a list where the next click jumps into another area.

- Turn each area into its own page: `/settings/display`, `/settings/tax`, `/settings/identity`, `/settings/type`, `/settings/lines`, `/settings/qr`, `/settings/elements`, `/settings/payment`, `/settings/whatsapp`, `/settings/sync`.
- `/settings` becomes a landing grid of cards linking to each page. Old `?section=` links redirect to the matching page so existing links keep working.
- Each page shows only its own controls, its own title and description, and the receipt preview drawer only on receipt-related pages.
- Sidebar links point at the new paths, so highlighting is exact and there is no scroll-jumping.

## 2. 100% offline checkout against local SQL Server

- Local database defaults change to Server `localhost\SQLEXPRESS`, Database `POS_Branch_DB`, Windows integrated auth, plus a Branch ID / Branch Name stored in local desktop config and editable under Settings > Sync & Backup.
- Local schema gains a `BranchSales` table (and its line items) carrying `id UNIQUEIDENTIFIER`, `branch_id`, `is_synced BIT`, `sync_status`, `created_at`, `updated_at`.
- New main-process handlers: `db:create-sale` (inserts sale and items in one transaction with `is_synced = 0` and the branch id injected in the main process), `db:get-products` (local catalog read), `db:get-pending-sync-count` (count of records where `is_synced = 0`).
- Preload exposes `window.electronAPI` with `createSale`, `getProducts`, `getPendingSyncCount` plus the existing sync controls. The current `window.pos` bridge stays as an alias so nothing already wired breaks.
- Checkout in the register calls `window.electronAPI.createSale()` whenever the desktop bridge is present and makes no network request. In a plain browser the existing local-storage/outbox path is used unchanged.
- Every handler returns `{ ok, data | error }` — no unhandled rejections; a database failure surfaces as an inline error and the sale is still recorded locally.

## 3. Sync & Backup Log Viewer for a branch terminal

Rebuild the log viewer with:

- Header bar: branch name / ID (for example "Branch: NYC-Main-01"), a status dot (green = central server reachable, gray = offline mode), "Pending sales waiting for cloud sync" count from the local pending query, last successful sync time, and a "Sync Branch Data Now" button.
- Table columns: Transaction ID, Timestamp, Sync Direction (PUSH Local -> Central / PULL Central -> Local), Status badge (Synced / Pending / Error), Error message.
- Log entries persist locally so history and failures survive restarts; background-worker attempts are logged as well.
- An "Online sync" toggle: off means pure offline operation, on means the worker pushes whenever the central server is reachable. The toggle persists per terminal.
- Failed rows stay visible with their error text and can be retried individually.

## Technical notes

- New route files under `src/routes/settings/`, with the section bodies extracted from today's `src/routes/settings.tsx` into shared components so no logic is rewritten.
- `electron/db/schema.sql`, `electron/db/repo.cjs`, `electron/main.cjs` and `electron/preload.cjs` gain the branch-sales table, the transactional sale insert, the catalog read and the pending-count query.
- `src/lib/local-db.ts` gets `createSale`, `getProducts`, `getPendingSyncCount` typings and browser fallbacks; `src/lib/sync-log.ts` records transaction id and direction.
- All IPC calls are wrapped in try/catch on both sides; SQL errors are returned as strings and never thrown across the bridge.