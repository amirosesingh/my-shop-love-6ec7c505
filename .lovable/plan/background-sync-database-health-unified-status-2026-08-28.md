# Background Sync, Database Health & Unified Status

## What I found (read-only review)

**Local database layer — mostly correct already**
- One shared local bridge (`src/lib/local-db.ts`) over the Electron `window.pos` preload; no duplicate connections are created.
- One shared central client (`src/integrations/supabase/external-client.ts`), plus the Lovable client. Fine.
- Problem: three components poll the local DB status independently on their own timers — `StatusCluster.tsx`, `components/database/SqlAdminBadge.tsx`, `LocalDatabaseSettings.tsx`.
- Records carry `terminal_id`/`branch_id`/`seq`/`occurred_at` on queue entries, but there is no consistent `device_id` + `synced` + `updated_at` stamp on the record payloads themselves.

**Sync queue — exists, needs tuning**
- `src/lib/sync-outbox.ts` is a real durable queue (localStorage) with operation, payload, attempts, last attempt, quarantine, versions.
- Backoff exists but is 1s / 2s / 4s … capped at 30s, not the requested 5s / 15s / 45s capped at 2–5 min.
- Queue is disabled on Web/Android by design (`isOnlineOnly()`), so offline-first only applies to the Windows till.

**Background worker — one engine, but connectivity truth is split**
- `src/lib/sync-engine.ts` runs a 15s interval, a mutex'd cycle, a 5s-debounced reconnect wake, plus its own separate 30s `public_flags` ping.
- `src/lib/connection-health.ts` has a second heartbeat (cloud + local probe, 2s cache).
- `sync-outbox.isOnline()`, `SyncStatus.tsx` and `OfflineGate.tsx` use raw `navigator.onLine` — a third, unreliable source of truth.
- Drain is not batched: `drainOutbox()` walks the whole queue in one pass.

**Conflict handling — partly right**
- Row-version last-write-wins with conflicts recorded in `sync-conflicts.ts`.
- Stock already merges via `stock_apply_delta` / `stock_reconcile` rather than overwriting. Good; keep.

**Status display — this is the real mess (5 competing indicators)**
- `SyncStatus.tsx` (pill), `sync/SyncBadge.tsx` (hook + badge), `StatusCluster.tsx → ConnectionStatusButton`, `SystemStatusPill.tsx` (appears unused), `MobileStatusSheet.tsx`, plus `TillLoader.tsx` and `OfflineGate.tsx` full-screen states and `SqlAdminBadge.tsx`.
- They compute tone/label with different rules, so they can disagree on screen.
- `OfflineGate` shows a full "No internet connection" screen instantly at launch from `navigator.onLine` — exactly the premature-offline behaviour to remove.
- No "connecting" startup state anywhere.

**Logging**
- Three overlapping logs: `sync-log.ts` (300 entries, localStorage), `sync-audit.ts`, `sync-conflicts.ts`. Viewable in Sync Hub.

## What I will change

### Stage 1 — one heartbeat, one truth
- Make `connection-health.ts` the single connectivity authority: it owns the heartbeat interval (idle ~20s, faster while pending), exposes `connectivity()` = `connecting | online | offline`, and notifies subscribers.
- Remove the duplicate ping inside `sync-engine.ts`; the engine subscribes to health instead and forces a pass immediately on the offline→online transition.
- `navigator.onLine` becomes only a hint that triggers an immediate heartbeat, never the displayed state.

### Stage 2 — queue & worker tuning
- Change backoff to 5s / 15s / 45s / 135s capped at 300s (keep the id-derived jitter).
- Drain in batches (default 25 ops per pass) instead of the whole queue.
- Keep the existing mutex, quarantine and rollback behaviour untouched.
- Stamp every queued payload with `device_id` (terminal id), `updated_at`, and mark `synced` on confirmation, where the target table has those columns.

### Stage 3 — single unified status component
- New `src/components/pos/status/SystemStatus.tsx` + `useSystemStatus()` hook as the only status source: connectivity, sync phase + pending count, local DB reachable/writable with last read/write time, last confirmed cloud sync.
- Rewrite `SyncStatus.tsx`, `ConnectionStatusButton`, `MobileStatusSheet` to render this one component; delete unused `SystemStatusPill.tsx`.
- Badge colours: green synced, yellow syncing/pending, red offline or error. Click/tap expands a details panel with pending count, last sync, last error, and links to the Sync Hub.
- No blocking modals; failures surface in the badge and the panel only.

### Stage 4 — startup "connecting" state (Web, Electron, Android)
- Cloud icon with a pulse during startup, nothing else — no logo, no toast, no error.
- State flips only when **both** the first heartbeat has resolved **and** a 1.5s minimum has elapsed; no upper cap — it stays "connecting" until a definitive answer arrives.
- Resolved states: plain cloud (online), slashed cloud (offline), pulsing cloud + counter (syncing).
- `OfflineGate.tsx` reworked to never render its offline screen until connectivity is definitively `offline`; `TillLoader.tsx` reuses the same icon states.
- Same behaviour on all three platforms.

### Stage 5 — logging
- Keep `sync-log.ts` as the rolling log, tightened to failure classification (network / server / validation) with timestamp, and surfaced in the Sync Hub debug view (existing admin-gated screen). No new log store.

### Stage 6 — editable config (last, only after 1–5 verified)
- Expose sync interval, retry limit and batch size in the Sync settings panel, reading defaults from the new constants module.

## Technical notes
- No database or offline-schema migration is required for stages 1–5; `device_id` stamping uses existing terminal columns where present, and I will report any table that lacks one rather than altering schema without approval.
- Existing behaviour deliberately kept: Web/Android stay online-only (no local queue), stock merges by delta, quarantine/rollback, credential-rejection parking.
- Verification: typecheck, full vitest run, plus new tests for backoff schedule, batching, connectivity state machine, and the minimum-display-time rule.
