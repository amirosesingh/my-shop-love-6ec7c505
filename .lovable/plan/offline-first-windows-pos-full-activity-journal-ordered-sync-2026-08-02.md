# Offline-First Windows POS: Full Activity Journal, Ordered Sync, Layout Cleanup

Four parts: capture every action as a timestamped log that survives offline, sync branches back in the right order when the connection returns, make the rest of the app work with no internet on the Electron build, and stop the whole page scrolling.

## 1. Complete offline activity journal

Every action becomes a durable local log entry, whether or not there is internet.

- One journal per terminal holding: what happened (feature + action), who did it (staff name, role, staff id), which branch and terminal, the exact local timestamp, and a device-time/received-time pair so clock drift is visible.
- Coverage across every feature: sale, exchange, refund, void, hold/resume, discount and coupon apply, drawer open, shift open/close, login/logout and mid-shift switch, product create/edit/price change, stock adjustment, transfer/request, purchase order receiving, member create/edit/points, promotion changes, settings changes, printing/reprint, WhatsApp send, and sync events themselves.
- Nothing is dropped when offline: entries queue locally (local SQL Server on Windows, browser storage on web) with no size cap other than a rolling archive, and are never overwritten by a later cloud pull.
- The Audit page works fully offline, reading the local journal, with a badge showing which entries are still unsynced.

## 2. Ordered, multi-branch sync when the link returns

- Every queued write and log entry carries branch id, terminal id, a monotonic per-terminal sequence number and the original timestamp, so replay preserves the exact order things happened at that branch.
- On reconnect the queue drains oldest-first per terminal, in sequence, so a sale that was voided offline never lands after the void.
- Conflicts across branches resolve by record ownership: stock movements are applied as deltas per branch (never overwriting another branch's count), and last-write-wins by timestamp only for shared master data (products, settings, promotions), with the losing version kept in the journal.
- Each entry is idempotent (unique id + sequence), so a retry after a half-completed push never double-posts a sale.
- Sync page shows per-branch status: pending count, oldest pending item, last successful push/pull, failures with a retry, and a plain-language log of what was synced.
- A manual "Sync now" button plus automatic drain on reconnect.

## 3. Offline-first behaviour (Electron)

- **Offline sign-in for staff:** after each successful online sign-in the terminal caches that employee's PIN verifier (hashed only), name, role, branch and permission matrix locally. With no connection the PIN is checked against that cache; the cache expires after a configurable window (default 30 days).
- **Admin email login stays online-only**, with a clear offline message.
- **Boot without the cloud:** startup no longer blocks on the cloud fetch. The terminal loads its last local snapshot (products, members, sales, promotions, branches, settings) instantly, then refreshes in the background once online.
- **All register work offline:** sales, exchanges, refunds, holds, voids, drawer opens, shifts, bookings, stock adjustments, transfers/requests, purchasing, member creation and points.
- **Printing, cash drawer and customer display** are already local — unchanged.
- **WhatsApp bills** need the cloud, so offline they queue and send automatically on reconnect, with a visible "queued" state.
- **Terminal licence check** no longer locks the till when unreachable: the last good result is cached and honoured for a grace period (default 7 days).
- **Status indicator** in the top bar: Offline / Syncing / Synced with pending count.

## 4. Cloud-only admin features hidden on Windows

Hidden from the desktop sidebar and blocked at the route level (typed URL shows "Manage this from the web admin console"):

- Terminal Activation (issue/revoke device tokens)
- Staff Management (accounts, PINs, permission matrix)
- Locations / Warehouses management
- WhatsApp API credentials and other secure credential screens

Everything else stays in the desktop app under the existing permission matrix.

## 5. Fix the unnecessary scrolling

- Shell becomes a fixed-height frame (`h-screen overflow-hidden`): sidebar and top bar pinned, one scroll region for page content.
- Register: product grid and cart scroll independently; totals and pay buttons always visible at the bottom.
- Long tables (Inventory, Receipts, Reports, Audit): sticky headers, body scrolls inside its card. No double scrollbars.

## Technical notes

- New `src/lib/activity-journal.ts`: append-only local journal (branch, terminal, seq, deviceTime, actor, feature, action, payload, syncState); backed by `window.pos` local SQL Server when present, localStorage otherwise. `audit-log.ts` writes through it instead of straight to the cloud.
- `sync-outbox.ts`: add `branchId`, `terminalId`, `seq`, `occurredAt` to `QueuedOp`; strict FIFO per terminal in `sync-engine.ts`; delta-based stock ops instead of absolute upserts.
- New Cloud table `activity_journal` (branch/terminal/seq unique) plus staff-only read and insert policies, with grants; audit page reads local first, cloud for cross-branch view.
- New `src/lib/offline-credentials.ts` (WebCrypto PBKDF2 verifier + expiry) used by `pos-auth.tsx` when `verifyCashierPin` cannot reach the backend.
- New `src/lib/offline-snapshot.ts`; `pos-store.tsx` hydrates from it and stops gating `ready` on the network.
- `use-revocation-check.ts`: cached grace window instead of failing closed offline.
- `nav-config.ts` gains `desktopHidden`; `AppShell.tsx` gains a `DESKTOP_BLOCKED` route set plus the fixed-height layout.
- Tests for journal ordering/replay idempotency, offline PIN verification and expiry, snapshot hydration, and the desktop block list.
