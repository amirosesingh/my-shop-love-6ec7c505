# Complete configuration / build / OTA isolation audit and fix

## What the audit found so far (evidence-based)

1. **Build-time injection bypasses the current guard.** The Lovable Vite wrapper
   (`node_modules/@lovable.dev/vite-tanstack-config/dist/index.js:708`) runs
   `loadEnv(mode, process.cwd(), "VITE_")` and turns every `VITE_*` value in the tracked root
   `.env` into an `import.meta.env.*` define — regardless of the `envDir: "scripts/no-env"` set
   in `vite.config.ts`. The project's own `define` blanks only the ten names listed in
   `WEB_ONLY_ENV_NAMES`; any other `VITE_*` name still gets inlined into an Android/Windows
   bundle. The wrapper exposes an `envDefine: false` option that disables this entirely — the
   correct, minimal fix for device builds.
2. **OTA is a live re-contamination path for Android.** `src/platforms/mobile/web-bundle-updates.ts`
   downloads `web-<version>.zip` from `https://updatecms.luckycharmsdnbhd.com/pos-app/latest/android/web`,
   writes it to Capacitor `Directory.Data` (`web/<version>/…`), records it in `localStorage`
   (`pos.ui.webBundle`) and calls `Capacitor.setServerBasePath()` at launch. That directory and
   `localStorage` **survive an APK upgrade** (only a full uninstall clears them), and the only
   gate is `isNewerBundle(stored, APP_VERSION)`. So a bundle published *before* the isolation fix,
   with a version higher than the running app, keeps overriding the clean APK assets.
   The Android workflow zips `capacitor-shell/` into that same feed, so bundles built before the
   fix are still sitting in R2 under `latest/android/web/`.
3. **CI is clean on the surface**: the Android workflow injects no `VITE_*` and already runs
   `scripts/verify-no-web-config.cjs`, but that scanner walks plain files only — it does not open
   the `web-*.zip` OTA bundle, the APK, or `app.asar`, so it can pass while a packaged archive
   carries a key.

## Audit still to complete before/while fixing

- Confirm `mergeConfig` ordering actually lets the project `define` win over the wrapper's, and
  enumerate every `VITE_*` name present in `.env` that is *not* in `WEB_ONLY_ENV_NAMES`.
- Trace the Windows equivalent: `electron/updater.cjs` feed, `dist-desktop`, `app.asar`, and the
  Electron config stores (`config-store.cjs`, `cloud-credentials.cjs`, `db-config-store.cjs`) —
  whether an old renderer or old sealed config survives a reinstall.
- Produce the requested configuration table (Supabase URL/key, backend URL, update URL, API and
  auth config × Web/Android/Windows × storage × build-time vs runtime) from the real modules
  (`external-supabase-config.ts`, `backend-config.ts`, `server-origin.ts`, Electron stores,
  mobile secure storage).
- Run real `MOBILE_BUILD` and `DESKTOP_BUILD` builds here and grep the produced bundles plus the
  zipped OTA bundle for the web host and key prefix — before and after the fix.

## The fix (minimum necessary)

### 1. Kill build-time env injection for device builds
`vite.config.ts`: for `MOBILE_BUILD`/`DESKTOP_BUILD`, pass `envDefine: false` to the wrapper in
addition to the existing `envDir`/`define` guards. No `VITE_*` value from any `.env` or CI runner
can then be inlined, including names not on the block list.

### 2. Make the OTA path unable to serve a pre-fix bundle
- Add a **bundle epoch/compatibility marker**: the app only accepts a downloaded bundle whose
  manifest declares an epoch at or above the one compiled into the shell. Every bundle published
  before this fix lacks it and is rejected.
- On startup, when a stored bundle fails that check (or its version is not newer than the shell),
  delete the stored files and clear `pos.ui.webBundle`, so an already-downloaded pre-fix bundle is
  purged from existing devices on the next launch instead of lingering.
- Android workflow: publish the epoch in `latest.json`/the shared manifest, and run the artifact
  scan on the zipped bundle before upload.

### 3. Verification that actually opens archives
`scripts/verify-no-web-config.cjs`: unpack and scan `.zip` (OTA bundle), `.apk`, and `.asar`
contents rather than treating them as opaque; fail (not skip) when an archive cannot be read.
Wire it into both workflows after packaging and before the R2 upload.

### 4. Windows parity
Apply the same "no build-time env" guarantee and the same archive-aware scan to
`dist-desktop`/`app.asar`/the installer. If the audit shows an old renderer or stale sealed config
can survive a reinstall, add the equivalent invalidation there.

## Explicitly not changed

POS/trading logic, database schema and migrations, UI, inventory, sales, reporting, permissions,
the Web build and its Cloudflare variables, and the R2 deploy steps themselves.

## Deliverable

The full report you asked for — root cause, configuration map, build map, import map, storage map,
OTA result, files changed / inspected-but-unchanged, CI/CD result, artifact evidence from real
builds, and the explicit final yes/no answers. Version bumped with `node scripts/bump-version.cjs`.
