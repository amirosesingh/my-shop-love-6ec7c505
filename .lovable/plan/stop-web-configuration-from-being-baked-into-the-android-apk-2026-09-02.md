# Stop web configuration from being baked into the Android APK and Windows installer

## What the audit found

The leak is real, and it happens before Capacitor or electron-builder ever run.

1. **`.env` is committed to the repository** (`git ls-files` lists it) and it holds live values:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_POS_SUPABASE_URL`,
   `VITE_POS_SUPABASE_ANON_KEY`.
2. Both platform builds run plain `vite build` from the repo root —
   `scripts/mobile-build.cjs` (`MOBILE_BUILD=1`) and `scripts/desktop-release.cjs`
   (`DESKTOP_BUILD=1`). Vite auto-loads `.env` for every mode, and there is no
   `envDir`/`envPrefix` restriction in `vite.config.ts`.
3. `src/lib/external-supabase-config.ts` reads those four names as **static**
   `import.meta.env.VITE_*` expressions (lines 87-91), precisely so Vite inlines them.
   So the checked-in web URL and key become string literals inside the APK's JS
   chunks and inside `dist-desktop`, which electron-builder packages.
4. `scripts/mobile-build.cjs` only strips the rendered `__POS_CONFIG__` script tag from
   `index.html`. It does not touch the inlined constants in the JS bundle, so it removes
   the visible half of the leak and leaves the baked half.
5. The Android workflow additionally injects `VITE_POS_SERVER_URL: ${{ vars.POS_SERVER_URL }}`,
   which bakes the hosted web backend address into the APK; `src/lib/backend-config.ts`
   uses it as a fallback (`baked()`) when the device has nothing saved — exactly the
   "Android falls back to web config" pattern to remove.

Runtime guard already present and worth keeping: `supabaseConfig()` throws for
`isTerminalApp()` before consulting any bundle value. That is why the mixing is not
visible in normal use — but the credentials are still physically inside the shipped
artifacts, which is what this fix addresses.

## The fix

### 1. Build-level isolation (the source of the leak)

- `vite.config.ts`: when `MOBILE_BUILD` or `DESKTOP_BUILD` is set, point env loading at an
  empty directory (`envDir`) so no `.env`, `.env.production` or `.env.local` in the repo is
  read, and define every web env name (`VITE_SUPABASE_*`, `VITE_POS_SUPABASE_*`,
  `VITE_SUPABASE_EXTERNAL_*`, `VITE_POS_SERVER_URL`) as `undefined` so any static read
  inlines to nothing instead of a value.
- Platform build scripts scrub the inherited process environment of the same names before
  spawning Vite, so a CI runner variable cannot re-introduce them.

### 2. Workflow isolation

- Android workflow: drop the `VITE_POS_SERVER_URL` injection from the bundle step. The
  server address stays a per-device setting (already supported in Settings and activation).
- Windows workflow: no web env is injected today; add the same explicit guarantee and keep
  `POS_UPDATE_URL` (update feed address, not tenant config).
- Neither workflow gains access to Supabase variables or secrets.

### 3. No fallback

- `src/lib/backend-config.ts`: remove `baked()`. On Android/Windows the address comes only
  from the device store; missing stays missing.
- Keep `supabaseConfig()`'s terminal hard-stop as-is.

### 4. Clean builds

Both platform scripts delete stale output first (`dist/`, `dist-desktop/`,
`capacitor-shell/`, `android/app/build/`, `release/`) so no earlier web-flavoured bundle is
repackaged.

### 5. Artifact verification (fails the build, not just a report)

A shared script scans the produced artifacts — the APK's packaged assets and
`capacitor-shell/`, plus `dist-desktop/` and the unpacked Electron resources — for the web
project host, the publishable/anon key prefix, `VITE_SUPABASE`, `VITE_POS_SUPABASE` and the
web backend URL. Any hit exits non-zero. Wired into `mobile:build`, `desktop:release`, and
as an explicit step in both workflows after packaging and before upload.

A unit test also asserts a mobile/desktop-mode Vite config resolves the web env names to
nothing.

## Untouched

Web build and its `.env`/Cloudflare variables, the Cloudflare Worker deploy, the R2 upload
steps, database schema, and all POS/UI/business logic.

## Verification I will run here

Clean `MOBILE_BUILD` and `DESKTOP_BUILD` builds in this sandbox, then grep the produced
bundles for the current web Supabase host and key to show zero matches before and the
before/after difference. The Gradle APK assembly and electron-builder packaging themselves
run in GitHub Actions; the same verification script runs there against the real artifacts.

## Technical notes

Files touched: `vite.config.ts`, `scripts/mobile-build.cjs`, `scripts/desktop-release.cjs`,
`scripts/verify-no-web-config.cjs` (new), `src/lib/backend-config.ts`,
`.github/workflows/android-apk.yml`, `.github/workflows/desktop-release.yml`,
`package.json`, plus one test. Version bumped with `node scripts/bump-version.cjs`.
