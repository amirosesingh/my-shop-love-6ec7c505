# Android APK guide + R2 upload, Live Dashboard in the top nav, always-on barcode scanning

## 1. Step-by-step Android app guide

`docs/android-apk.md` is rewritten as a numbered walkthrough you can follow start to finish:

- What the phone app is (a Capacitor shell loading the hosted POS) and what it needs (Node 22, JDK 21, Android SDK — or nothing at all if you use GitHub Actions).
- Route A — GitHub only: Actions -> Android APK -> Run workflow -> optional app URL -> download the artifact or grab the file from the update bucket.
- Route B — on your own PC: install, `npx cap add android`, `npx cap sync android`, `gradlew assembleDebug`, where the APK lands.
- Installing on the phone: enable "Install unknown apps", copy the APK, open it.
- Setting the app URL permanently with the `POS_MOBILE_URL` repository variable.
- Signing for a real release: create a keystore, add the four repository secrets, switch to `assembleRelease`; the workflow already has the signing step ready to be switched on.
- Troubleshooting: blank screen (wrong URL / http), Gradle failures, camera permission for barcode scanning.

## 2. APK uploads to your bucket automatically

`.github/workflows/android-apk.yml` is extended so it does not only leave an artifact behind:

- Runs on manual click, on `v*` tags, and on pushes to `main` that touch mobile-related files.
- After the build, renames the APK to `NorthwindPOS-<version>.apk`, and uploads both that and a stable `NorthwindPOS-latest.apk` to Cloudflare R2 under `pos-app/android/`, using the same R2 secrets the desktop workflow uses.
- Writes a tiny `android/latest.json` (version, filename, date) next to them so the app can point staff to the current download.
- Keeps the GitHub artifact and attaches the APK to the GitHub release on tag builds.
- Concurrency guard so two runs never overwrite each other mid-upload.

## 3. Live Dashboard moves to the top level

The dashboard is currently one of the options inside the Sales & Operations hub. It becomes its own top-level entry:

- A standalone item pinned near the top of the sidebar, next to Register, with its own icon — no longer listed under Sales & Operations or on that hub page.
- Same permission gate (`can_view_dashboard`), so accounts without it still don't see it.
- Search and the desktop/web builds behave the same as before.

## 4. Barcode scanning on the register screen

Today the scan box lives in the product panel, which is hidden behind "Add product" once the window is narrow — so on a small window or a phone you cannot just scan.

- A dedicated scan bar sits permanently at the top of the sale (cart) side of the register, on every window size. It stays focused, and any scanner input plus Enter punches the item straight into the ticket.
- Unknown barcode: a short toast says so and the field clears, ready for the next scan; the field never blocks typing in other inputs.
- Because most scanners act like a keyboard, a global capture also catches fast scans while the cursor is elsewhere on the register (not while a dialog or a text field is being typed in), so scanning always adds to the ticket.
- On the phone build a "Scan with camera" button opens the device camera and adds the item on a successful read; on desktop/web that button is hidden.
- Shift-closed behaviour is unchanged: scanning is blocked with the existing "open a shift" message.

## Technical notes

- `docs/android-apk.md` rewrite; `.github/workflows/android-apk.yml` gains version stamping, `aws s3 cp` to `s3://updatelccms/pos-app/android/`, `latest.json`, release attach, and a commented signing block.
- `src/components/pos/nav-config.ts`: `/dashboard` promoted out of the `sales` group into a top-level `standaloneNavItems` list; `SidebarNav.tsx` and `SectionHub.tsx` render it accordingly.
- New `src/components/pos/ScanBar.tsx` used in `src/routes/index.tsx` above the cart, reusing the existing scan-submit handler; a `useScannerCapture` hook buffers fast keystrokes ending in Enter.
- Camera scanning via `@capacitor-mlkit/barcode-scanning`, loaded dynamically and only when running inside Capacitor, so web and Electron bundles are unaffected.
