# Fix the signed Android release build

## What's actually wrong

`scripts/android-release.cjs` patches the `build.gradle` that `npx cap add android`
generates at build time (the `android/` folder is not stored in this repo — it is
regenerated on every CI run). It does that with regular expressions, and the regex
that finds the `release { ... }` block is brace-blind: it stops at the first line
that starts with `}`, so on some generated files the `signingConfig
signingConfigs.release` line lands in the wrong block (or gets appended twice on
re-runs), and Gradle fails.

Because `android/app/build.gradle` is generated, there is no committed copy to
"reset" — the durable fix is to make the patcher correct and verifiable.

## The fix

**1. Rewrite `scripts/android-release.cjs`**

- Replace regex block-hunting with a small brace-matching parser: locate the
  `android { ... }` block, then its direct `buildTypes { ... }` child, then that
  block's direct `release { ... }` child, tracking nesting depth and ignoring
  braces inside strings/comments.
- Update `versionCode` / `versionName` only inside `defaultConfig`.
- Insert `signingConfigs { release { ... } }` as a direct child of `android { }`
  (before `buildTypes`), reading `ANDROID_KEYSTORE_FILE`,
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` via
  `System.getenv(...)`. Skip if already present, so re-runs are idempotent.
- Add `signingConfig signingConfigs.release` only inside `buildTypes.release`,
  never inside `signingConfigs`, and never twice.
- After patching, self-verify: fail with a clear message unless there is exactly
  one `signingConfigs.release` definition, exactly one `signingConfig
  signingConfigs.release` reference, and that reference sits inside
  `buildTypes.release`. Print the patched block to the CI log.
- Validate that the keystore file named by `ANDROID_KEYSTORE_FILE` exists and is
  non-empty before writing anything.

**2. Update `.github/workflows/android-apk.yml`**

- Pin `actions/checkout@v4`, `actions/setup-node@v4`, `actions/setup-java@v4`
  (temurin), `android-actions/setup-android@v3`.
- Keep the single "Configure signed upgrade build" step that exports
  `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEY_PASSWORD`, `ANDROID_KEYSTORE_FILE`, `ANDROID_VERSION_NAME`
  (`steps.meta.outputs.version`) and `ANDROID_VERSION_CODE`
  (`github.run_number`); decode the base64 keystore to
  `android/release.keystore` and then run `node scripts/android-release.cjs`.
  Decoding uses `base64 --decode -i` with whitespace tolerated, and the step
  fails loudly if the decoded file is empty.
- Build with `./gradlew assembleRelease --stacktrace` inside `working-directory:
  android`, passing only the signing env vars — no `-P` flags or duplicated
  gradle arguments.
- Leave the rest of the pipeline (offline bundle, permissions patch, artifact
  upload, R2 sync, release attachment) unchanged.

## One deviation to flag

You asked for Java 17. This project is on Capacitor 8, which requires JDK 21 —
Java 17 would fail the Gradle build outright. The workflow will stay on
`java-version: 21` (temurin) and Node stays at 24 — the combination the rest of
the pipeline already builds with successfully.
