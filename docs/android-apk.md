# Building the Android app (step by step)

The phone app is a **live client of the central system**. It keeps no business
data on the device: catalogue, members, stock, prices, shifts and reports are
read from the backend every time a screen opens, and every write goes straight
to the backend. With no connection it shows a "No internet connection" screen
and continues automatically once the signal returns.

The Windows till and the web app are unchanged — they keep their offline-first
behaviour.

## What you need

- **GitHub route:** nothing installed locally.
- **Local route:** Node 22, Bun, JDK 21, Android SDK (Android Studio installs
  the Android SDK; install JDK 21 separately if it is not included).

## Route A — build it on GitHub (recommended)

1. Push your code to GitHub (already the case if the repository is synced).
2. Open the repository → **Actions** → **Android APK** → **Run workflow**.
3. Leave the *app URL* box **blank** — that produces the offline app. Type a
   URL only if you deliberately want a thin shell that loads a hosted site.
4. Wait for the run to finish (first run takes ~10 minutes).
5. Download the APK in one of two places:
   - the run's **NorthwindPOS-android** artifact, or
   - your update bucket at `pos-app/android/` —
     `NorthwindPOS-<version>.apk` plus a stable `NorthwindPOS-latest.apk`
     and a small `latest.json` describing the current build.

The workflow also runs automatically on pushes to `main` that touch the mobile
files and on `v*` tags, so the bucket always holds the newest APK.

## Route B — build it on your own PC

```bash
bun install
bun run mobile:build        # packages the whole POS into capacitor-shell/
npx cap add android         # first time only
npx cap sync android
cd android
gradlew.bat assembleDebug   # Windows development build only
```

The APK lands in `android/app/build/outputs/apk/debug/`.

If this checkout was installed before the Capacitor storage plugins were
added, close the development server and refresh dependencies before rebuilding:

```bash
rmdir /s /q node_modules
bun install
npx cap sync android
```

PowerShell users can replace the first command with
`Remove-Item node_modules -Recurse -Force`. Do not add Capacitor plugins to
Rolldown's `external` list: they must be included in the phone bundle.

## Updates on the phone

The app checks `pos-app/android/latest.json` in the same update bucket the
Windows till uses, on start-up and every six hours. When a newer version is
there a strip appears at the bottom of the screen: tap **Update**, the APK
downloads and Android's installer takes over. Allow "install unknown apps" for
the POS once, and updates are one tap from then on.

## Live-data behaviour

- Every screen loads from the backend when it opens, refetches when the app
  returns to the foreground, and shows a skeleton while loading.
- Barcode scans query the backend and show live product, price and stock;
  adjustments post straight to the backend.
- Nothing about the business is stored on the phone — no local database, no
  cached inventory, no sync outbox. Only interface preferences (theme, text
  size, terminal identity) are kept in app storage.
- No internet means a full-screen notice; the app reconnects and reloads the
  current page by itself.

## Live web updates

Alongside the APK the workflow uploads a zipped web bundle and a manifest to
`pos-app/android/web/`. The app checks it on start-up and every six hours,
downloads a newer bundle quietly and serves it from the next launch, so
interface fixes do not need a Play Store release. The native shell keeps
updating through the APK / Google Play.

## Install it on a phone

1. Copy the `.apk` to the phone (USB, Drive, or download from the bucket link).
2. On the phone: **Settings → Apps → Special access → Install unknown apps** and
   allow the app you are installing from (Files or Chrome).
3. Tap the `.apk` and confirm. The POS opens full screen.

## Set the app URL once

Repository → **Settings → Secrets and variables → Actions → Variables** → add
`POS_MOBILE_URL` with your POS address (must be `https`). Every later build uses
it automatically.

Also add `POS_SERVER_URL` with the same `https` address. The offline bundle runs
entirely on the phone, but a few calls (cashier sign-in check, the sync relay,
the staff list on the sign-in screen) need a real server. Without this variable
those calls hit the phone's own file server, staff cannot be listed, and sign-in
falls back to typing the username with cached offline credentials.

## Permanent signing for install-over updates

Every APK published by GitHub must use the same permanent signing key. Android
then installs the new APK over the old one instead of requiring an uninstall,
so the encrypted terminal activation stored by the app is retained.

1. Create the keystore once and keep an offline backup:
   `keytool -genkey -v -keystore pos.keystore -alias pos -keyalg RSA -validity 10000`
2. Add these GitHub Actions repository secrets: `ANDROID_KEYSTORE_BASE64`
   (base64 of the complete keystore file),
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
3. Run the Android APK workflow. It patches the camera permission, restores the
   keystore only for the build, and creates a signed release APK automatically.

Do not replace or regenerate this keystore for later releases. An APK signed by
a different key cannot upgrade the installed app and would require an uninstall,
which intentionally removes Android app storage and terminal activation.

## Bucket upload secrets

The upload step reuses the desktop release secrets: `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY` and `R2_ENDPOINT`. Files go to
`s3://updatelccms/pos-app/android`.

## Troubleshooting

- **Blank screen on the phone** — the app URL is wrong or uses `http`. Rebuild
  with a valid `https` URL.
- **Gradle fails** — usually a missing JDK 21 or Android SDK locally; the GitHub
  route avoids both.
- **Cannot resolve `@capacitor/preferences`** — the checkout has stale or
  incomplete dependencies. Run the clean install commands above, then rebuild.
- **Chunks larger than 500 kB** — this line is a performance warning, not a
  failed build. Read the error printed after it to find the actual failure.
- **Build succeeds but reports missing `dist/server`** — pull the latest
  `vite.config.ts`; phone builds require the explicit `MOBILE_BUILD=1` output.
- **Camera scanning asks nothing / does nothing** — use an APK produced by the
  current workflow; it verifies `android.permission.CAMERA` before building.
  Then allow the camera permission when Android prompts. If permission was
  denied previously, enable it under Android Settings → Apps → POS → Permissions.
- **Android asks to uninstall the previous APK** — the APKs were signed with
  different keys. Restore the original permanent keystore secrets and rebuild;
  do not uninstall if preserving terminal activation is required.

Desktop-only features (silent receipt printing, cash-drawer kick, the local
SQL Server database) are hidden automatically on Android.
