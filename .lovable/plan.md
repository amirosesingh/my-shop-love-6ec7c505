# Point the phone app at lccms.luckycharmsdnbhd.com and add bucket-based APK updates

## What is wrong now

The Android shell is pointed at `https://updatecms.luckycharmsdnbhd.com` — that host is the update bucket, not the POS site. So the installed APK correctly loads what it was told to load: a bucket listing. Nothing is wrong with the build; the address is wrong.

## 1. Point the app at the real POS

- The phone app defaults to `https://lccms.luckycharmsdnbhd.com/` — your own POS domain. The `POS_MOBILE_URL` repository variable still overrides it if you ever move the site.
- That domain must be connected to this project in Project settings, Domains, and the project published, otherwise the phone (and any browser) will not reach the POS. If it is not connected yet, that is the one step to do outside the code.
- Loading the live site means the phone gets every feature of the web app — register and scanning, shifts, inventory and transfers, members, bookings, purchasing, reports, dashboard, audit, settings, receipts, WhatsApp bills — nothing is stripped for mobile.
- Camera, printing over the network, and file downloads are enabled in the Android shell so scanning and receipt actions work from the phone.
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