# Electron Online-First Database Parity Repair

## Goal
Make the Electron POS use the same live data and features as the web app, with one deterministic policy:

```text
Cloud available  -> read/write cloud first, mirror to local SQL
Cloud unavailable + local available -> read/write local SQL, queue sync
Cloud returns -> push pending local changes, then pull fresh cloud data
Cloud unavailable + local unavailable -> block data-dependent actions
```

## Confirmed problems
- Electron currently defaults to local mode, not online-first (`src/lib/db-mode.ts`), so a newly installed till can bypass the intended cloud-first path.
- Local SQL connection details are loaded only when the settings component opens, and `pos:connect` is only called by the manual “Save & connect” action. The Electron main process does not reconnect automatically on startup (`src/lib/local-db.ts`, `src/components/pos/LocalDatabaseSettings.tsx`, `electron/main.cjs`).
- The renderer stores local SQL credentials, while the main process—which owns the SQL connection—has no durable startup copy. Therefore local fallback is unavailable after restart until an operator reconnects manually.
- The Electron sync worker is initialized only inside `pos:connect`. If local SQL is not manually connected, its cloud push/pull worker never starts (`electron/main.cjs`).
- The worker only pulls products, tiers, promotions, and settings. It does not pull stores, members, transfers, or transfer lines; the local repository also has no `stores` table and uses legacy `transfers` while the app writes `stock_transfers` / `stock_transfer_items` (`electron/sync/worker.cjs`, `electron/db/repo.cjs`, `electron/db/schema.sql`, `src/lib/stock-transfers.ts`).
- Electron local product rows return `stock_by_store` as JSON text without normalizing it to the product model. The current UI therefore cannot reliably use local per-branch quantities.
- Several data paths still bypass the global router. `dbRouter` is effectively unused by production call sites, while startup, reports, stock transfers, and settings call the cloud client or local bridge directly.
- Connectivity UI relies heavily on `navigator.onLine` and the browser outbox. It does not subscribe to Electron SQL status, so the displayed mode can disagree with the databases that can actually serve the request.
- The packaged main process launches a local application server. Relay calls use that localhost origin, but the local server may not have the server-only central database credential available, causing Electron-only relay failures even when the hosted web relay works.

## Implementation

### 1. Make Electron startup self-sufficient
- Add a main-process encrypted local database configuration store using Electron’s OS-backed secure storage.
- Persist the complete SQL configuration when “Save & connect” succeeds; migrate the renderer-held configuration once for existing installations.
- Before opening the till window, automatically connect to local SQL, apply the schema, and start a reconnect supervisor with bounded backoff and periodic pings.
- Initialize cloud sync independently of local connection success using the activated terminal’s tenant configuration, then reinitialize when activation changes.
- Broadcast structured cloud/local readiness changes to the renderer and reset stale health caches immediately.

### 2. Enforce online-first routing everywhere
- Change desktop default mode to online-first and migrate old implicit defaults without overriding an operator’s explicit setting.
- Replace mode decisions based only on `navigator.onLine` with real cloud and local probes.
- Consolidate reads and writes behind the shared gateway:
  - cloud first when cloud health is good;
  - local fallback only for connection-class cloud failures;
  - cloud fallback when local is unavailable;
  - `AllTargetsFailed` when neither target accepts the operation.
- Preserve validation, permission, duplicate, and schema errors instead of incorrectly treating them as connectivity failures.
- Route remaining checkout, shifts, stock changes, settings, transfer, inventory, and reporting access through the same policy; remove legacy local-only Electron shortcuts.

### 3. Bring the local SQL schema and sync model to feature parity
- Add idempotent local tables/migrations for stores, stock transfers, transfer items, shift sessions, drawer events, held orders, stock adjustments, WhatsApp queue, and other operational tables used by the durable gateway.
- Align table names and columns with cloud operations, including dependency order and idempotency keys.
- Normalize SQL JSON columns in both directions (`stock_by_store`, transfer items, settings payloads, arrays/objects) so local and cloud records produce the same application models.
- Expand downward sync to include stores and the data needed for branch inventory/transfer screens; keep local unsynced rows protected during merges.
- Use authenticated terminal/relay semantics for Electron worker sync rather than anonymous direct writes.

### 4. Restore branch quantities and transfer destinations
- Build one routed state loader that returns products with complete `stockByStore`, all permitted stores, settings, shifts, members, and transfer data from cloud first or local snapshot second.
- Persist the same normalized store directory and per-branch quantities into local SQL after every successful cloud refresh.
- Make the All Shops and Transfers screens consume that routed state, so destination branches and quantities are identical in web and Electron.
- Refresh routed state after reconnection/convergence and after transfer receive/approve operations.
- Show stale/offline provenance and last refresh time without hiding valid cached branches or quantities.

### 5. Strict dual-failure gate and honest status UI
- Introduce a shared availability state with `cloud`, `local`, `activeTarget`, `syncPhase`, and `lastSuccessfulRead`.
- Disable checkout, shift mutation, stock adjustment, receiving, and transfer submission only when both databases are unavailable; keep non-data UI such as diagnostics and settings accessible.
- Before each durable mutation, re-probe stale health and attempt both targets in the required order. Do not clear carts or mutate local UI until one target confirms persistence.
- Replace the current browser-only sync pill with separate Cloud and Local indicators plus the active route and pending local count.
- Suppress false offline notifications when either target works; show one blocking modal only after both attempts fail.

### 6. Packaging and regression verification
- Ensure the Windows package includes the selected SQL driver and native files unpacked, and produce actionable driver/authentication diagnostics.
- Add automated matrix coverage for:
  1. cloud up + local up: cloud commit, async local mirror;
  2. cloud up + local down: cloud-only operation;
  3. cloud down + local up: local commit and pending sync;
  4. both down: blocked action and unchanged cart/state;
  5. restart with saved SQL config: automatic reconnect;
  6. Electron branch inventory: same store list and quantities as web;
  7. reconnection: idempotent push, cloud pull, no duplicate sale or transfer.
- Run focused unit/integration tests and a packaged Electron smoke test covering sign-in, catalogue load, branch stock, transfer destination selection, sale, restart, and recovery.

## Technical notes
- Cloud success remains authoritative in online-first mode; local mirroring must never delay checkout.
- Local fallback is a real SQL transaction, not browser storage.
- Sync ordering will preserve parent/child dependencies, and cloud/local upserts will use stable IDs to prevent duplicates.
- No operation will be reported as saved unless either cloud or local SQL confirms it.
