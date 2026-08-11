# Local SQL Server + unified routing + no false offline warnings

## What's already true today (verified)

- `mssql` is already a dependency, and the Electron main process already owns the local SQL Server connection (`electron/db/pool.cjs`), including the Windows-authentication path through `msnodesqlv8`. The local schema lives in `electron/db/schema.sql`, and reads/writes go through `electron/db/repo.cjs`.
- A unified database gateway already exists as `src/lib/db-router.ts` (cloud-first, background local mirror), and a background sync engine already exists as `src/lib/sync-engine.ts` (upward push of queued work plus downward delta pull).
- All user-facing messages already funnel through `src/lib/notify.ts`.

So this is not a green-field install: the work is finishing the driver setup on the desktop side, adding the health probe and notification guard, and closing the remaining gaps in routing and convergence.

## One important correction

`msnodesqlv8` and `mssql` are native Node modules. They cannot be imported from `src/lib/*`, because that code runs in the browser and on the edge server — importing them there breaks the build. The local database connection stays in the Electron main process (where it already is), and the app talks to it through the existing desktop bridge. Everything below respects that boundary; the behaviour you asked for is unchanged.

## What will be built

### 1. Driver and local schema
- Add `msnodesqlv8` as an optional desktop dependency and mark it as a native module for packaging, so Windows Authentication works in the packaged app while a machine without build tools still installs cleanly (falling back to SQL login).
- Extend `electron/db/schema.sql` so every mirrored table matches the cloud shape: `VARCHAR(36)` ids, `DATETIME2` timestamps, `BIT` booleans, plus `pending_sync BIT NOT NULL DEFAULT 1`, `temp_id`, and `synced_at` on every syncable table. Existing installs upgrade in place with additive guards — no data loss.
- Local writes use `MERGE`/`IF EXISTS` on the id, so a replayed write updates instead of duplicating.

### 2. Connection health probe (`src/lib/connection-health.ts`)
- One non-blocking probe that checks the cloud database (1000 ms timeout) and the local SQL Server through the desktop bridge (800 ms timeout) in parallel.
- Results cached for 2 seconds and shared by every caller, so rapid till actions never cause a burst of probes.
- Exposes `{ cloud, local, anyOnline }` plus a subscribe hook for status UI.

### 3. Notification guard (`src/lib/notification-guard.ts`)
- Every connectivity-flavoured message (Database Offline, Connection missing, Server setup/key missing, "saved locally, will sync") passes through the guard before it is shown.
- If either database is reachable, the warning is suppressed and any banner already on screen is cleared.
- Only when both are unreachable does the operator see a warning — and then it is the blocking one that matters.
- Genuine non-connectivity errors (permission, validation, duplicate) are untouched and still shown immediately.

### 4. Unified routing
- `src/lib/db-router.ts` becomes the single gateway (kept as `dbProxy`) and is wired to the probe:
  - Cloud reachable: read/write cloud first, then mirror into local SQL in the background with `pending_sync = 0`.
  - Cloud down, local up: write local with `pending_sync = 1` and a generated `temp_id`; no error popup.
  - Both down: guard fires, checkout is blocked cleanly, and the cart, dialog and form state stay exactly as they are on screen.
- Sweep the remaining modules that still reach past the gateway — checkout, shifts, stock transfers, staff management, inventory, settings — and route them through it.

### 5. Recovery and convergence
- Extend `src/lib/sync-engine.ts`: on network restore or a manual online toggle, Phase 1 pushes every local row with `pending_sync = 1` to the cloud keyed on `temp_id`/`id`, then stamps `pending_sync = 0`; Phase 2 pulls everything changed centrally since the last sync stamp and writes it into local SQL for full parity.
- Both phases are idempotent, so an interrupted sync resumes safely.

### 6. Verification
- Unit tests for the probe cache, the guard suppression rule, and the three routing branches; the existing suite stays green.
- Manual desktop checks: cloud only, local only, and reconnect-and-converge.

## Notes

- No changes to cloud data or the cloud schema.
- Web and Android builds are unaffected: with no desktop bridge the probe reports local as absent and behaviour matches today.