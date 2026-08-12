# Signed Android APK workflow (`android-release.yml`)

## What it does

A new GitHub Actions workflow that runs on every push to `main`, builds the web app,
wraps it with Capacitor, signs the APK with your keystore secrets, and uploads the
resulting `app-release.apk` as a downloadable artifact.

Steps in the workflow:

1. Checkout, Node.js 24 (npm cache), Java 17 Temurin, Android SDK.
2. `npm ci` (falls back to `npm install`), then `npm run build`.
3. `npx cap add android` (the `android/` folder is not committed, so it must be
   generated) followed by `npx cap sync android`.
4. Decode `ANDROID_KEYSTORE_BASE64` into `android/app/release-key.keystore`.
5. Inject a `signingConfigs.release` block into the generated
   `android/app/build.gradle` that reads `KEYSTORE_PASSWORD`, `KEY_ALIAS`,
   `KEY_PASSWORD` from the environment and points at `release-key.keystore`,
   then attach it to the `release` build type.
6. `./gradlew assembleRelease` in `android/` with those three env vars set from
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
7. `actions/upload-artifact@v4` uploads
   `android/app/build/outputs/apk/release/app-release.apk` as artifact
   `app-release-apk` (`if-no-files-found: error`).

## Technical notes

- Signing must be injected because Capacitor's generated `build.gradle` has no
  release signing config; step 5 does this with a small inline `node`/`sed`
  patch inside the workflow, using the exact env names you specified.
- Concurrency group `android-release-yml` with `cancel-in-progress: true` so
  rapid pushes don't queue up duplicate builds.

## Heads-up: overlap with the existing pipeline

`.github/workflows/android-apk.yml` already builds and signs an APK on every push
to `main` (using `ANDROID_*` env names, an R2 upload, and OTA manifests). Adding
this new workflow means two Android builds per push. I'll add the new file exactly
as requested and leave the existing one untouched; say the word if you'd rather
disable or replace `android-apk.yml`.
