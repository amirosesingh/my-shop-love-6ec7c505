# Android: live-data-only build

Android becomes a thin, always-online client of the existing cloud backend. Web and Windows are untouched — every change is behind a runtime `isNative()` check or lives in a new file that only the phone bundle loads.

## 1. No local business data on the phone

- The device storage mirror (`mobile-storage.ts`) stops mirroring business keys. Only UI preferences survive: theme, text size, last store/terminal, session token. Products, members, sales, shifts, suppliers, coupons and stock never touch device storage.
- On Android start-up the app clears any business keys left behind by a previous offline install, so upgrading phones do not carry stale stock figures.
- The offline snapshot, sync outbox and activity journal are disabled on Android: writes go straight to the backend and fail loudly instead of queueing.
- The local SQL Server / Electron database path stays exactly as it is for Windows; Android simply never reaches it.

## 2. Every screen reads live

- On Android, cached reads are switched off: each screen fetches from the backend when opened, refetches when the app returns to the foreground, and shows a skeleton while loading.
- Realtime updates already in place keep stock and prices current while a screen is open.
- Pull-to-refresh on the main lists for a manual reload.

## 3. No-connection screen

- A full-screen "No internet connection" state (icon, plain explanation, Retry button) covers the app whenever the phone is offline or the backend is unreachable.
- It watches for the connection coming back, then reloads the current page automatically — no restart, no crash, no frozen screen.
- Because there is no offline mode on Android, the till blocks all work until the connection returns; an in-progress cart is discarded with a clear message rather than silently kept.

## 4. Speed

- Pages load on demand rather than all at once, so the first screen appears quickly.
- Loading skeletons on every list and detail screen.
- Icons, fonts and UI images are pre-cached; business data never is.
- Requests are de-duplicated so opening a screen twice does not hit the backend twice.

## 5. Barcode scanner

- Camera scan → barcode goes to the backend → live product, live price, live stock come back.
- Stock adjustments post straight to the backend and the screen shows the server's new figure. Nothing is queued locally; if the post fails, the scan is shown as failed and can be retried.

## 6. Over-the-air web updates (self-hosted)

- The phone checks a small `web/latest.json` in your existing update bucket (`pos-app/android/web/`) on start-up and every few hours.
- If a newer web bundle is there it downloads the zip, verifies it, unpacks it into app storage and loads it on next launch — same idea as the Windows updater, no third-party service.
- The Android release workflow uploads the bundle and manifest alongside the APK it already produces.
- The native shell itself keeps updating through the APK / Google Play as today.

## Technical notes

- New `src/lib/live-mode.ts` exporting `isLiveOnly()` (= `isNative()`), used to gate snapshot/outbox/journal writes in `offline-snapshot.ts`, `sync-outbox.ts`, `activity-journal.ts`, `sync-engine.ts` and `pos-store.tsx`. Web/Electron paths keep their current behaviour byte-for-byte.
- `mobile-storage.ts`: replace the `pos.` prefix mirror with an explicit allow-list of UI keys, plus a one-time purge of non-allow-listed `pos.` keys.
- `NativeBoot.tsx` becomes the live gate: purge → connectivity check → render, with `@capacitor/network` (added dependency) plus `navigator.onLine` fallback; new `src/components/mobile/OfflineGate.tsx` renders the no-connection screen and calls `router.invalidate()` on recovery.
- Query defaults on native: `staleTime: 0`, `gcTime: 0`, `refetchOnWindowFocus: true`, `networkMode: "online"`, applied where the QueryClient is created in `src/router.tsx` — desktop/web defaults unchanged.
- Scanner screens call the existing product/stock queries by barcode; no new API surface, no schema change.
- Live web updates: `src/lib/web-bundle-updates.ts` using `@capacitor/filesystem` + `Capacitor.setServerBasePath`, manifest at `pos-app/android/web/latest.json`; `.github/workflows/android-apk.yml` gains a zip+upload step reusing the existing R2 secrets.
- No changes to `vite.config.ts` targets, Electron files, database schema, RLS or server functions.
