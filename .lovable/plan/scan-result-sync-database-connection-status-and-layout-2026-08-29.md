# Scan result — sync, database connection, status and layout

## 1. Pages/routes touching sync or database connectivity

- `src/routes/settings.system.tsx` — the hub. Tabs: `system` (CloudConnectionPanel + ServerKeysPanel + SystemStatusPanel), `database-health`, `logic-health`, `security-alerts`, `data-sync` (SyncHub), `data-comparison`, `inheritance`.
- `src/routes/settings.sync.tsx` — "Sync & backup": renders `BranchSettings` + `SyncSettings`.
- `src/routes/settings.database-explorer.tsx` — SSMS-style local SQL Server browser (admin only).
- `src/routes/settings.data-sync.tsx`, `settings.diagnostics.tsx`, `settings.logic-health.tsx`, `settings.inheritance.tsx` — redirect shims into `/settings/system?tab=…`.
- Supporting components: `components/pos/sync/SyncHub.tsx` (720 lines: queue, audit, conflicts, stock recovery, diagnostics, force push/pull), `sync/DataComparison.tsx`, `sync/SyncBadge.tsx`, `pos/SyncSettings.tsx`, `pos/SyncBehaviourSettings.tsx`, `pos/LocalDatabaseSettings.tsx`, `database/SchemaPanel.tsx` (996 lines), `database/SqlConnectionModal.tsx`, `database/DatabaseExplorer.tsx`, `database/DriverInstallPanel.tsx`, `settings/panels/{CloudConnectionPanel,DatabaseHealthPanel,SystemStatusPanel,ServerKeysPanel}.tsx`.
- Shared libs (already separated from UI): `sync-engine.ts`, `sync-outbox.ts`, `sync-status.ts`, `sync-log.ts`, `sync-audit.ts`, `sync-conflicts.ts`, `connection-health.ts`, `system-status.ts`, `local-db.ts`, `db-health.ts`, `central-schema.ts`, `central-drift.ts`, `feature-schema.ts`.

## 2. Where sync and DB-connection logic are mixed

- `src/components/pos/SyncSettings.tsx` — sync toggle/queue controls **and** `LocalDatabaseSettings` (SQL Server connection form) in one component; also calls `localDb()` directly.
- `src/routes/settings.sync.tsx` — branch identity + sync + local DB connection on one page.
- `src/routes/settings.system.tsx`, tab `system` — cloud credentials, server keys and overall system status in one stack.
- `src/components/pos/sync/SyncHub.tsx` — sync queue/audit/conflicts, but also prints local engine info (`localEngineInfo`) and database-mode labels.
- `src/components/database/SchemaPanel.tsx` — local schema repair **and** central (cloud) drift/repair SQL in one panel.

## 3. Schema as currently detected

- **Cloud (Supabase/Postgres):** ~60 tables — sales, sale_items, products, product_categories, product_barcodes, stores, shifts, shift_sessions, held_orders, bookings, booking_payments, members, membership_tiers, member_verifications, promotions, coupon_campaigns, issued_vouchers, coupon_events, suppliers, purchase_orders, purchase_order_items, stock_adjustments, stock_count_drafts, stock_transfers, stock_transfer_items, payment_transactions, payment_types, drawer_events, app_users, cashiers, staff_roles, user_roles, authorization_*, record_edits, audit_logs, system_audit_logs, activity_events, sync_metadata, terminal_tokens, terminal_commands, pos_settings, pos_store_settings, settings_* and more.
- **Expected-cloud contract in code:** `src/lib/central-schema.ts` (`CENTRAL_SCHEMA`, `CENTRAL_SCHEMA_VERSION = 1`) plus drift computation in `central-drift.ts`.
- **Local PC DB (SQL Server / SQLite mirror):** master file `database/schema.sql`, parsed at runtime by `electron/db/pool.cjs` (`parseSchemaManifest`), 50+ tables including local-only ones (sync_state, system_settings, outbox mirrors) plus local bookkeeping columns (is_synced, sync_status, last_error_at).
- **No `schema_migrations` tracking table exists in either database today** — every scan re-reports the same gaps.

## 4. Every place sync status is shown

1. `components/pos/status/SystemStatus.tsx` — `SystemStatusBadge` + popover (the intended single source, backed by `lib/system-status.ts`).
2. `components/pos/SyncStatus.tsx` — thin wrapper over the badge.
3. `components/pos/StatusCluster.tsx` — header cluster, renders the badge without a label.
4. `components/pos/MobileStatusSheet.tsx` — **its own** tone/pending logic from `sync-outbox` (`isOnline`, `pendingCount`) plus a nested `<SyncStatus />`.
5. `components/pos/sync/SyncBadge.tsx` — `useSyncBadge()` hook + separate badge, own tone rules.
6. `components/pos/sync/SyncHub.tsx` — badge, queue counters, audit table, conflicts, stock recovery, diagnostics, and **multiple** trigger buttons (force push, force pull, retry all, reconcile).
7. `components/database/SqlAdminBadge.tsx` — polls `localDb()` status on its own timer.
8. `components/pos/LocalDatabaseSettings.tsx` — own local sync status polling.
9. `settings/panels/SystemStatusPanel.tsx` and `DatabaseHealthPanel.tsx` — further status surfaces.
10. `components/pos/TillLoader.tsx`, `components/mobile/OfflineGate.tsx` — full-screen connectivity states.

## 5. Panel/modal pages and duplicate chrome

`SettingsSheet.tsx` wraps panels in `EmbeddedSettings`; `SettingsFrame` reads that flag and already drops the AppShell, the "All settings" back link and the page heading when embedded. So route-based settings cards are correct today. Risks to verify per card: panels opened `raw` get a `SettingsFrame wide` wrapper inside the sheet (extra padding/heading scaffolding), and any panel that renders `AppShell` or its own `<h1>` directly (e.g. hub-style components, `SectionHub`) would double up. That check must run over every entry in `src/lib/settings-catalog.tsx`, not just Settings.

## 6. Width

- Forced narrow (`max-w-4xl`) by `SettingsFrame` unless `wide` is passed: `/settings/sync`, `/settings/database-explorer`, and most settings routes.
- Already wide: `/settings/system` (all tabs, including SyncHub, DatabaseHealth, DataComparison).
- Should be wide but are not: sync queue/audit tables, schema/migration lists, database explorer, data comparison when opened standalone.
- Correctly narrow: identity, tax, region, printer, toggles, login.

---

# Proposed implementation (after your confirmation)

## Section 1 — split Sync vs Database Connection

- `/settings/sync` becomes **Sync only**: the unified sync panel, history/logs, conflicts. `BranchSettings` and `LocalDatabaseSettings` move out of it.
- New `/settings/database` = **Database Connection only**: cloud connection status/credentials (`CloudConnectionPanel`), local SQL Server connection + test (`LocalDatabaseSettings`, driver install), connection health readouts.
- `SyncSettings.tsx` is split into `SyncSettings` (behaviour only) and the connection pieces re-homed. No logic duplicated: both pages import from the existing `sync-engine` / `local-db` / `connection-health` libs.
- `/settings/system` tabs re-point: `data-sync` → sync page content, `system` keeps status + database connection links; legacy routes keep redirecting.

## Section 2 — one sync state, one panel, one button

- Extend `lib/system-status.ts` (or a new `lib/sync-state.ts` fed by the engine) into a single object: `status: idle|syncing|error|done`, `progress` %, `lastSyncedAt`, and `tables: Record<table, "synced"|"syncing"|"missing"|"failed">` with `currentIndex`/`total` for "Syncing table 3 of 7".
- `sync-engine.ts` publishes per-table progress as it walks its push/pull table list (no behaviour change to the engine itself).
- New `components/pos/sync/SyncPanel.tsx`: one row per table with ✅/⏳/❌, one progress bar, one **Sync now** button guarded by the engine mutex (`runExclusive`) and disabled while busy.
- Delete `sync/SyncBadge.tsx`; rewrite `MobileStatusSheet` and `SqlAdminBadge` to read the shared state (or just link to the sync page). Force push / force pull / retry-all become row-level actions inside the panel, not competing top-level triggers.

## Section 3 — schema health check + versioned migrations

**Expected schema (already exists, reused):**
- Cloud → `CENTRAL_SCHEMA` in `lib/central-schema.ts`.
- Local → `database/schema.sql` manifest via `parseSchemaManifest`.

**Tracking table** (added to both databases, idempotent):

```text
schema_migrations(
  id            text primary key,   -- "supabase_003_20260829"
  environment   text not null,      -- 'cloud' | 'local'
  checksum      text not null,      -- hash of the generated SQL
  generated_at  timestamptz not null,
  applied_at    timestamptz null,
  applied_by    text null
)
```

**Flow** (`lib/schema-health.ts` + `lib/schema-migrations.ts`):
1. Read actual local schema (SQL bridge) and actual cloud schema (existing PostgREST/central metadata probe).
2. Diff each against its expected definition → gap list, each entry tagged `Local PC DB` or `Supabase Cloud DB`.
3. Subtract gaps already covered by a `schema_migrations` row with `applied_at` set.
4. Sequence number = highest existing number for that environment + 1; filename `supabase_003_20260829.sql` / `local_003_20260829.sql`. Cloud and local gaps are always generated as two separate files — the generator takes an environment argument and can never mix.
5. On generate, insert the row with `applied_at = null`; on the next scan, if the gap is gone, auto-stamp `applied_at`. A manual **Mark as applied** button does the same.

**UI:** new "Setup / health check" panel (Electron-focused, cloud section visible everywhere): local DB reachable?, table-by-table diff per environment, per-file download button with the correct on-screen instruction ("Run this in your Supabase SQL editor" / "Run this in your local database client"), and a migration history list with applied/pending state. Existing `SchemaPanel.tsx` repair actions stay but stop being the drift reporter.

Cloud `schema_migrations` needs one Supabase migration (table + grants + RLS restricted to authenticated/service role); the local table is created by the existing guarded-statement schema manager.

## Section 4 — layout

- `SettingsFrame` gets width from the route: data-heavy routes (`/settings/sync`, `/settings/database`, `/settings/database-explorer`, data comparison, schema health) pass `wide`; forms keep `max-w-4xl`.
- Audit every card in `settings-catalog.tsx` opened through `SettingsSheet`: confirm no panel renders `AppShell`, its own sticky back link, or its own `<h1>` while embedded; fix any that do by routing them through `useEmbeddedSettings()` like `SettingsFrame` already does. Remove the redundant `SettingsFrame` wrapper for `raw` cards where the sheet header already supplies the title.

## Notes

- Background sync engine behaviour, backoff, quarantine and the cloud status icon logic stay as they are — this is UI structure plus a new schema-health module.
- Verification: typecheck, full vitest, new tests for the diff/versioning/filename logic and the "already applied" suppression, plus route smoke checks.
- Final reply will list every changed file grouped under sections 1–4.
