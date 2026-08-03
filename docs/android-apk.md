# Building the Android APK

The phone app is a Capacitor shell around the hosted POS — the same screens,
no separate codebase.

## From GitHub

1. Repository → **Actions** → **Android APK** → **Run workflow**.
2. Optionally set *app URL* (otherwise the repository variable
   `POS_MOBILE_URL`, or the default published site, is used).
3. Download the `NorthwindPOS-android` artifact — it contains the debug `.apk`
   you can side-load onto a phone.

## Locally

```bash
npm install
POS_MOBILE_URL="https://your-pos-url" npx cap add android   # first time only
POS_MOBILE_URL="https://your-pos-url" npx cap sync android
cd android && ./gradlew assembleDebug
```

The APK lands in `android/app/build/outputs/apk/debug/`.

For a Play Store build, add a keystore as repository secrets and switch the
workflow step to `./gradlew assembleRelease`.

Desktop-only features (silent receipt printing, cash-drawer kick, the local
SQL Server database) are hidden automatically on Android.
