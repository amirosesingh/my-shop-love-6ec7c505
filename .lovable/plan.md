# Web and Android become online-only, then Stage 3

## Part 1 — One honest rule: only Windows works offline

Today the phone is explicitly live-only, while the browser build is "offline-first in theory": it never actually queues (there is no local database engine behind a browser tab), but the interface still shows offline switches, sync queues and local-database wording that can never do anything. That mismatch is what makes the web till look broken when the line drops.

What changes:

- Web is treated exactly like Android: a live client of the central system. Windows/Electron keeps its full offline-first behaviour, byte-for-byte.
- The "No internet connection" screen (already built for the phone) also covers the browser build, with the same automatic recovery when the connection returns.
- The Online/Local switch is hidden and pinned to Online on web and phone; it stays fully usable on Windows.
- Sync queue, outbox counters, "pending changes", local-database settings and offline snapshot wording disappear on web and phone instead of showing permanent zeros.
- Every save on web either reaches the central database or fails visibly — nothing is silently parked in browser storage.
- The register cart draft still survives a reload on both, as it does today; it is the only local data kept.

## Part 2 — Stage 3: cross-platform consistency

With the offline story settled, Stage 3 from the audit closes the honesty gaps that remain:

- **Printing and cash drawer**: receipt printing and drawer kick are Windows-only (they need the desktop shell). On web and phone the buttons currently look available. They will show as unavailable with a plain explanation, with the browser print dialog offered as the fallback for receipts.
- **Local database / diagnostics screens**: hidden on web and phone rather than shown empty.
- **Status pill**: on web and phone it reports connection state only (Live / No connection), not sync backlog.
- **Updates**: Windows keeps the installer updater, Android keeps its bundle check, web shows neither.

Stage 4 (removing the dead code these changes leave behind) stays parked until you approve it separately.

## Technical notes

- `src/lib/live-mode.ts`: add `isOnlineOnly()` = `!isElectron()` (covers web + native). `isLiveOnly()` stays as the Android-specific purge rule so the phone's storage-purge behaviour is unchanged; the new predicate gates queueing, mode switching and UI.
- Switch to `isOnlineOnly()` in: `sync-outbox.ts` (`canQueue`, `syncEnabled`), `db-mode.ts` (`databaseModeLocked`, `effectiveDatabaseMode`, failure wording), `offline-snapshot.ts`, `pos-db.ts` failover branch (~line 1537), `telemetry.ts` mode label.
- `OfflineGate.tsx`: gate on `isOnlineOnly()` and mount it around the app shell for all builds, not just native.
- Query defaults in `src/router.tsx`: apply the live-client defaults (`staleTime: 0`, refetch on focus/reconnect, `networkMode: "online"`) whenever `isOnlineOnly()`.
- Hide on `isOnlineOnly()`: `SyncSettings`, `SyncHub`/`SyncBadge` counters, `LocalDatabaseSettings`, `DbConnectionModal`, the sync entries in `nav-config.ts`, and the mode switch in `SystemStatusPill`/`StatusCluster`.
- Hardware gating uses the existing `isElectron()` check in the escpos/drawer paths; the UI reads a single `canPrintReceipts()` helper in `src/lib/escpos.ts`.
- Tests: extend `src/lib/__tests__` with cases asserting the browser build never enqueues, the mode is locked to online, and Electron behaviour is unchanged.
- Version bump via `node scripts/bump-version.cjs`.
