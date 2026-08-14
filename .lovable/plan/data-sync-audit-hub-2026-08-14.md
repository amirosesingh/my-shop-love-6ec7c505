# Data Sync & Audit Hub

Finishes the last piece of the sync overhaul: a dedicated management page plus a live status badge in the top bar.

## 1. Status badge (top bar)
Replace the current compact sync indicator in the app top bar with a four-state badge:

- Green — Online, everything pushed
- Yellow — Syncing (spinner, current entity)
- Orange — Offline, shows pending record count
- Red — Error, shows last failure

Clicking it opens the new hub. The badge reads from the existing sync state store plus pending counts from the local database bridge, so it works in both the desktop shell and the browser.

## 2. New page: Settings → Data Sync & Audit
Route `/settings/data-sync`, linked from the settings hub next to "Sync & backup".

- **Engine card** — which local database engine is active, its file path, online/offline state, last successful pull.
- **Record metrics** — side-by-side cloud vs local counts per entity (products, members, sales, bookings), with a pending-outbox count.
- **Action cards** — Force Push and Force Pull buttons with progress bars and disabled states while a cycle is running (respects the existing sync mutex, so no overlapping runs).
- **Audit ledger** — table of every sync operation (time, direction, entity, records, status, error) with filters by direction/status, a retry action on failed rows, and a clear-ledger control for admins.

## 3. Wiring
No new backend work. The page reads the audit ledger and local counts through the bridges already built, and triggers push/pull through the existing sync engine entry points.

## Technical notes
- New route `src/routes/settings.data-sync.tsx` using `SettingsFrame`, with its own head metadata.
- New components `src/components/pos/sync/SyncHub.tsx` and `SyncBadge.tsx`.
- Badge mounted in `src/components/pos/AppShell.tsx` (replacing `SyncStatus` in the header) and reused in `MobileStatusSheet.tsx`.
- Data sources: `src/lib/sync-status.ts`, `src/lib/sync-audit.ts` (`localInfo`, `localAuditList`, `localAuditClear`), `src/lib/sync-engine.ts`, `src/lib/sync-outbox.ts`.
- Ledger list is subscription-driven via `subscribeSyncAudit`, so it updates live during a sync cycle.
- Retry re-enqueues the failed operation through the outbox rather than replaying raw SQL.
