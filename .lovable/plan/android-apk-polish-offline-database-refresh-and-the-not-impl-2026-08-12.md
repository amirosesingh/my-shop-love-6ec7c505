# Android/APK polish, offline database refresh, and the "not implemented" error

## 1. Fix "http.then is not implemented on Android"

The update/network helper hands the Capacitor HTTP plugin object back out of an `async` function. JavaScript then treats that plugin object as a promise and calls `.then` on it, which the native bridge reports as an unimplemented plugin method — so any action that touches it fails with that message.

Fix: never return a plugin object from an async function (wrap it in a plain object), and fall back to a normal request when the native HTTP plugin is not present in the build. Audit the other native bridges (files, preferences, scanner, updates) for the same shape so nothing else can trigger it.

## 2. Admin sees every branch on the phone

Today a registered terminal pins everyone — including admins — to the terminal's own branch. Since the phone app is for admins, an admin signed in on Android will be able to switch to any branch from the branch picker; the pin still applies to cashiers/supervisors and to Windows tills, so branch integrity for selling is unchanged. The picker moves into the phone's top bar (and stays in the drawer) so it is reachable in one tap.

## 3. Phone header: nothing important gets lost

The phone top bar currently tries to show clock, sync pill, system status, security alerts, activity bell, theme and lock, and they get squeezed off screen. Replacement layout:

- Always visible: menu, store code, sync/database state (single compact pill), a bell that merges security alerts + activity with one combined unread count, and lock.
- Clock hidden on narrow screens (acceptable per your note).
- One "Status" sheet opened from the pill showing, in full: online/offline, database mode (central vs this device), pending/queued items with a "Sync now" button, security alerts list and the activity feed — the same information as the desktop header, just stacked.
- The same sheet is linked from System & Settings so it is always reachable.

## 4. Start-up and loading screens tell the truth about the database

- The phone's "Starting the till…" splash becomes the same connection-aware loader used elsewhere: green when the central database answers, amber when working from this device, blue while syncing, with a retry and "continue on this device" after a stall.
- The permissions loader that also says "Starting the till…" is switched to the same component, so web, Windows and Android all report loading state identically.

## 5. Offline SQL Server file brought up to date

`db/offline/pos-offline-sqlserver.sql` is missing tables the app now writes and still carries two obsolete ones. It will be regenerated from the shell's current schema so it contains: system_settings, stores, stock_transfers + items, suppliers, stock_adjustments, held_orders, activity_events (notifications), terminal/device settings, plus the existing tables, with the sync bookkeeping columns and indexes, and the legacy BranchSales/BranchSaleItems tables retired. The script stays idempotent and re-runnable, and the README gets the step-by-step run order.

## 6. Regression pass

After the changes: typecheck, run the existing test suite (offline sync, db-router, platform failover, route guards, permissions) and verify the register, shift open/close, sync pill and settings pages still behave on web. Version bump for the APK build.

## Technical notes

- `src/lib/native-http.ts`: return `{ http }` from the loader; add a plugin-availability check plus fetch fallback.
- `src/components/pos/AppShell.tsx`: relax the terminal pin for `isAdmin` on native; new `MobileStatusSheet` component; header re-layout.
- New `src/components/pos/MobileStatusSheet.tsx` reusing `SyncStatus`, `SystemStatusPill`, `SecurityAlertBell`, `ActivityBell` internals.
- `src/components/pos/NativeBoot.tsx` and `src/lib/pos-permissions.tsx`: use `TillLoader`.
- `db/offline/pos-offline-sqlserver.sql` regenerated against `electron/db/schema.sql`; no cloud migration needed.
