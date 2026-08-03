# Building the Android app (step by step)

The phone app is a Capacitor shell around the hosted POS — the same screens as
the web app, no separate codebase. Follow either route below.

## What you need

- **GitHub route:** nothing installed locally.
- **Local route:** Node 22, JDK 21, Android SDK (Android Studio installs both).

## Route A — build it on GitHub (recommended)

1. Push your code to GitHub (already the case if the repository is synced).
2. Open the repository → **Actions** → **Android APK** → **Run workflow**.
3. Optionally type the *app URL* the phone should open. Leave blank to use the
   repository variable `POS_MOBILE_URL`, or the default published site.
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
npm install
POS_MOBILE_URL="https://your-pos-url" npx cap add android   # first time only
POS_MOBILE_URL="https://your-pos-url" npx cap sync android
cd android && ./gradlew assembleDebug
```

The APK lands in `android/app/build/outputs/apk/debug/`.

## Install it on a phone

1. Copy the `.apk` to the phone (USB, Drive, or download from the bucket link).
2. On the phone: **Settings → Apps → Special access → Install unknown apps** and
   allow the app you are installing from (Files or Chrome).
3. Tap the `.apk` and confirm. The POS opens full screen.

## Set the app URL once

Repository → **Settings → Secrets and variables → Actions → Variables** → add
`POS_MOBILE_URL` with your POS address (must be `https`). Every later build uses
it automatically.

## Signing for a Play Store release

1. Create a keystore:
   `keytool -genkey -v -keystore pos.keystore -alias pos -keyalg RSA -validity 10000`
2. Add these repository secrets: `ANDROID_KEYSTORE_BASE64` (base64 of the file),
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
3. In `.github/workflows/android-apk.yml`, swap the debug build step for
   `./gradlew assembleRelease` (a commented note marks the spot).

## Bucket upload secrets

The upload step reuses the desktop release secrets: `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY` and `R2_ENDPOINT`. Files go to
`s3://updatelccms/pos-app/android`.

## Troubleshooting

- **Blank screen on the phone** — the app URL is wrong or uses `http`. Rebuild
  with a valid `https` URL.
- **Gradle fails** — usually a missing JDK 21 or Android SDK locally; the GitHub
  route avoids both.
- **Camera scanning asks nothing / does nothing** — allow the camera permission
  for the app in Android settings, then reopen the register.

Desktop-only features (silent receipt printing, cash-drawer kick, the local
SQL Server database) are hidden automatically on Android.
