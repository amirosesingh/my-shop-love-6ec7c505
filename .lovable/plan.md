# Offline-first Android app: the whole POS inside the APK

## The core change

Today the APK is only a window onto a website: it loads a URL, so with no internet there is nothing to show (and because that URL was the update bucket, you got a bucket listing). To run fully offline, the app itself has to carry the application.

So the phone build stops loading a remote address and instead ships the complete POS inside the APK, exactly like the Windows till carries its own copy. Online features still work when there is a connection; everything else keeps running without one.

## 1. The app ships inside the APK

- A dedicated phone build compiles the POS into plain files (all screens, styles, scripts) that are packaged into the APK, with routing handled on the device. No server call is needed to open a screen.
- `capacitor.config.ts` drops the remote `server.url` and points at that bundled build, so airplane mode opens straight into the register.
- Every screen is included — register and barcode scanning, shifts, inventory, transfers, members, bookings, purchasing, promotions, receipts, reports, dashboard, audit, staff, stores, settings. Nothing is trimmed for mobile; the layouts already adapt to a narrow screen.

## 2. What works offline, and how

- **Data on the device.** The existing "last known good snapshot" of products, members, prices, promotions, tiers, stores, staff and settings is stored on the phone and loaded at start-up, so the catalogue and member lookups work with no signal. It refreshes automatically whenever the phone is online.
- **Selling offline.** Sales, exchanges, refunds, held bills, bookings, shift open/close, stock adjustments, transfers, drawer events and audit entries are all written locally first and queued in the existing outbox, in order, per device.
- **Sign-in offline.** Staff who have signed in on that phone once before can sign in again with their PIN with no connection, using the existing cached-credential path; a first-ever sign-in still needs one online moment.
- **Sync when the signal returns.** The queue drains automatically in the background, in the same order the actions happened, using the sync engine the Windows till already uses. A sync indicator shows pending count, last sync time, and any parked item.
- **Storage that survives.** Phone storage moves off browser localStorage onto the device's own storage (Capacitor Preferences plus SQLite for the queue and snapshot), so Android cannot silently evict the data and large catalogues fit.
- **Needs a connection (by design):** terminal activation, first-ever sign-in, WhatsApp bill sending, saving encrypted settings, and pulling other stores' live figures. Each shows a clear "needs internet" message instead of failing silently.

## 3. APK updates from your bucket, like Windows

- On launch and every few hours the app reads `pos-app/android/latest.json` on your bucket and compares versions.
- If a newer build exists, a banner offers "Update"; tapping downloads `NorthwindPOS-<version>.apk` with a progress bar and hands it to Android's installer. Dismissible, never interrupts a shift.
- Settings, Updates gains an Android card mirroring the Windows one: installed version, latest on the bucket, last checked, "Check now".
- Because the app is bundled, an update is the only way the phone's app code changes — no surprise mid-shift reload from the web.

## 4. Docs

`docs/android-apk.md` gains: how the offline build is produced, what works with and without signal, how the update banner behaves, and the one-time "allow installing unknown apps" permission.

## Technical notes

- New `MOBILE_BUILD` mode in `vite.config.ts` producing a static client bundle (prerendered shell, SPA fallback) into `capacitor-shell/`; `capacitor.config.ts` drops `server.url` and keeps `webDir`.
- Routes that currently depend on server functions (secure settings, WhatsApp send, session helpers) are guarded behind an `isOnline`/`isNative` check with offline messaging; nothing else in the route tree changes.
- New `src/lib/mobile-storage.ts` adapter behind the existing snapshot/outbox/journal modules: Capacitor Preferences + `@capacitor-community/sqlite` on Android, localStorage elsewhere — no call-site changes.
- New `src/lib/android-updates.ts` polling `https://updatecms.luckycharmsdnbhd.com/pos-app/android/latest.json`; download/install via Filesystem + file-opener; banner mounted in `__root.tsx` only under Capacitor.
- Android manifest: internet, camera, `REQUEST_INSTALL_PACKAGES`, FileProvider for the downloaded APK.
- `.github/workflows/android-apk.yml` runs the mobile build before `cap sync`, stamps `versionName`/`versionCode` from `package.json`, and keeps the R2 upload of the APK plus `latest.json`.

## Note on the domain

Because the phone app now carries the POS itself, `lccms.luckycharmsdnbhd.com` is no longer needed for the APK to work. It stays relevant for browser users and as the address the app talks to for sync; the sync target stays configurable.
- Add a safety net: if the app cannot reach the configured address (offline, wrong URL, DNS failure), the shell shows a small "Server address" screen where the address is typed once and remembered on the device, instead of a blank page or a bucket listing.
- With the correct address loaded, the phone gets the full web application — register, shifts, inventory, reports, settings — the same build the browser and the Windows till run.

## 2. APK updates from the same bucket as Windows

The Windows till checks `pos-app/` on the bucket. Android gets the equivalent against `pos-app/android/`:

- On launch and every few hours, the app fetches `pos-app/android/latest.json` (already produced by the Android workflow) and compares its version with the installed one.
- If a newer build exists, a banner appears: "Version X is available — Update". Tapping it downloads `NorthwindPOS-<version>.apk` from the bucket with a progress bar, then hands it to Android's installer. Staff can dismiss it and keep selling; nothing interrupts a shift.
- Settings, Updates gains the Android view of the same information: installed version, latest version on the bucket, last checked, and a "Check now" button — mirroring the Windows card.
- The first update prompts Android's "allow this app to install unknown apps" permission once; the docs cover that step.

## 3. Docs

`docs/android-apk.md` gets a short section on setting `POS_MOBILE_URL` to your POS domain (with the warning that it must not be the update bucket), and how the in-app updater works.

## Technical notes

- `capacitor.config.ts`: default `server.url` changed off the bucket domain; keep the `POS_MOBILE_URL` override.
- `capacitor-shell/` bootstrap logic plus a small remembered-address fallback stored in device storage.
- New `src/lib/android-updates.ts` polling `https://updatecms.luckycharmsdnbhd.com/pos-app/android/latest.json`; download and install via `@capacitor/filesystem` + a file-opener plugin, guarded so web/Electron bundles are untouched.
- `AppUpdateSettings.tsx` gains an Android branch alongside the existing Electron branch; an update banner rendered once in `__root.tsx`, only when running inside Capacitor.
- Android workflow keeps writing `latest.json` and `NorthwindPOS-latest.apk`; `versionCode`/`versionName` stamped from `package.json` so version comparison is reliable.
- Android manifest permissions: internet, camera, `REQUEST_INSTALL_PACKAGES` (for self-update), and a FileProvider so the downloaded APK can be handed to the installer.