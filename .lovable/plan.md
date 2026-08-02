# Offline-First Windows POS + Layout Scroll Cleanup

Three things: stop the app scrolling the whole page, make almost every feature work with no internet on the Windows/Electron build, and keep cloud-only admin tools (terminal activation etc.) out of the desktop app.

## 1. Fix the unnecessary page scrolling

Today the shell uses `min-h-screen`, so the sidebar, header and page all grow and the whole window scrolls — you lose the toolbar and have to scroll up and down constantly.

- Shell becomes a fixed-height frame: `h-screen overflow-hidden`, sidebar and top bar pinned, and one scroll region inside the content area.
- Register screen: product grid and cart each scroll on their own; totals/pay buttons stay locked at the bottom, always visible.
- Long tables (Inventory, Receipts, Reports, Audit): sticky headers, the table body scrolls inside its card instead of stretching the page.
- No nested double scrollbars — one scroller per pane.

## 2. Offline-first behaviour (Electron)

The app already keeps data in local storage and a local SQL Server bridge with a sync outbox. The gaps are startup and sign-in, which currently wait on the cloud.

- **Offline sign-in for staff:** on every successful online sign-in, the terminal caches that employee's PIN verifier (hashed, never the plain PIN), name, role, assigned store and permission matrix in the local database. When there is no connection, the PIN is checked against that cached verifier and a local session is granted with the same permissions. Cache expires after a configurable window (default 30 days) so removed staff can't sign in forever.
- **Admin email login stays online-only.** Offline it shows a clear message instead of a silent failure.
- **Boot without the cloud:** startup stops blocking on the cloud fetch. The terminal loads its last saved snapshot (products, members, sales, promotions, stores, settings) instantly, then refreshes in the background when a connection returns. A full snapshot is written after each successful cloud load.
- **All register work offline:** sales, exchanges, refunds, holds, voids, drawer opens, shift open/close, bookings, stock adjustments, transfers/requests, member creation and point updates all write locally and queue in the outbox; the sync engine drains them when the link returns.
- **Receipt printing, cash drawer and customer display** are fully local already — unchanged.
- **Queued-not-lost actions:** WhatsApp bill sending needs the cloud, so offline it queues and sends automatically once online, with a visible "queued" state on the receipt.
- **Terminal licence check:** the revocation/heartbeat check no longer locks the till when it can't reach the server. The last good result is cached and honoured for a grace period (default 7 days), after which the terminal asks to reconnect.
- **Clear status:** an Offline / Syncing / Synced indicator in the top bar with pending-item count.

## 3. Cloud-only admin features hidden on Windows

These stay in the web admin console and are hidden from the desktop build — both from the sidebar and blocked at the route level, so a typed URL shows "Manage this from the web admin console":

- Terminal Activation (issue/revoke device tokens)
- Staff Management (creating accounts, PINs, permission matrix)
- Locations / Warehouses management
- WhatsApp API credentials and other secure credential screens

Everything else — register, shifts, inventory, purchasing, transfers, members, promotions usage, bookings, receipts, reports, audit, receipt/tax/display settings, sync and backup — stays in the desktop app, subject to the existing permission matrix.

## Technical notes

- `AppShell.tsx`: `h-screen overflow-hidden` frame, single `overflow-y-auto` main, plus a `DESKTOP_BLOCKED` route set checked alongside the existing `ROUTE_PERMISSIONS` guard when `isDesktop()`.
- `nav-config.ts`: new `desktopHidden?: boolean` flag on nav items, filtered by `SidebarNav`.
- New `src/lib/offline-credentials.ts`: WebCrypto PBKDF2 verifier cache + expiry; used by `pos-auth.tsx` when `verifyCashierPin` cannot reach the backend.
- New `src/lib/offline-snapshot.ts`: save/restore the full POS state slice; `pos-store.tsx` hydrates from it before attempting `loadCloudState()` and no longer gates `ready` on the network.
- `use-revocation-check.ts`: cache last good check with a grace window instead of failing closed when offline.
- `whatsapp.ts`: enqueue sends into the existing outbox when offline; sync engine flushes them.
- Unit tests for offline PIN verification, cache expiry, snapshot hydration and the desktop route-block list.
