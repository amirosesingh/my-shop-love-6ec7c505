# Forensic audit: where web configuration can still reach Android and Windows

Audit only — no source file was changed.

## Headline

At the current commit the **build chain is clean**. I proved it directly rather than
by reading: resolving `vite.config.ts` with `MOBILE_BUILD=1` produces

```text
import.meta.env.VITE_SUPABASE_URL                => undefined
import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY    => undefined
import.meta.env.VITE_POS_SUPABASE_URL            => undefined
import.meta.env.VITE_POS_SUPABASE_ANON_KEY       => undefined
import.meta.env.VITE_POS_SERVER_URL              => undefined
(envDir = scripts/no-env)
```

So a device build compiled from this commit inlines nothing. The web configuration you are
still seeing on devices does not come from compiling today's source. It comes from the three
paths below.

## 1. Chains as they actually run

| Target | Command | Bundler | Packager | Output |
|---|---|---|---|---|
| Web | `vite build` | Vite + wrapper | Cloudflare/wrangler | `dist/` |
| Android | `mobile:build` -> `scripts/mobile-build.cjs` (`MOBILE_BUILD=1 vite build`, render shell) | Vite | `cap sync` + Gradle | `capacitor-shell/` -> APK |
| Windows | `desktop:release` -> `scripts/desktop-release.cjs` (`DESKTOP_BUILD=1 vite build`) | Vite | electron-builder | `dist-desktop/` -> `release/` |

Legacy scripts still in `package.json` (`desktop:build`, `desktop:package`, `desktop:installer`)
run `vite build` directly and skip the scrub + verification wrapper.

## 2. First contamination point (the only one left in source)

`node_modules/@lovable.dev/vite-tanstack-config/dist/index.js:708`

```js
const loadedEnv = loadEnv(mode, process.cwd(), "VITE_");
```

The wrapper reloads every `VITE_*` from the **repository root** and turns them into
`import.meta.env.*` defines. It ignores our `envDir: "scripts/no-env"`. The only reason the
APK is clean today is that our `define` block overrides those names one by one, after the
merge. That is a name-by-name allow-list over a committed `.env` that holds live values
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_POS_SUPABASE_URL`,
`VITE_POS_SUPABASE_ANON_KEY`). Add one new `VITE_*` name to `.env` and it silently ships.

## 3. Why devices still show web configuration — the likely live cause

**Android OTA web bundles.** `src/platforms/mobile/web-bundle-updates.ts` polls
`https://updatecms.luckycharmsdnbhd.com/pos-app/latest/android/web` every 6 hours, downloads
`web-<version>.zip` into app storage and serves it from the next launch, replacing the APK's
own assets. Every bundle uploaded before the isolation fix was built with the web `.env`
inlined. A freshly installed clean APK therefore re-acquires the old contaminated bundle
within hours. The same applies to already-downloaded bundles cached on devices, and to
Windows tills whose updater feed still points at pre-fix installers.

This alone explains the symptom with zero defects in today's source.

## 4. Verification blind spots (why the guard did not catch it)

- `scripts/verify-no-web-config.cjs` does a plain substring scan. The Android step scans
  `android/app/build/outputs/apk/release` — an APK is a **zip**, so baked strings are
  DEFLATE-compressed and cannot match. That scan can never fail.
  (`capacitor-shell/`, scanned uncompressed in the same step, is what actually protects us.)
- Files over 250 MB are skipped silently; a packed `app.asar` with `node_modules` can exceed
  that, so the Windows resources scan can silently cover nothing.
- Neither the R2 bucket contents nor a device's downloaded bundle is ever scanned.

## 5. Cleared during the audit

- Committed `capacitor-shell/index.html` — placeholder only, no configuration.
- No hardcoded Supabase host or key anywhere in `src/`, `electron/`, `scripts/`.
- electron-builder `files` does not package `.env`.
- Both workflows inject no Supabase variables; Android no longer injects `VITE_POS_SERVER_URL`.
- `dist`, `dist-desktop`, `release`, Android build output are gitignored — no stale committed artifacts.
- No webpack/rollup/parcel config exists; Vite is the only application bundler.

## 6. Minimum set of files to change (fix, not yet applied)

1. **Purge the update channels** (highest impact, no code): delete the pre-fix
   `web-*.zip` / `web-latest.zip` objects and pre-fix Windows installers from R2, then
   re-release from this commit. Optionally have the phone discard a stored bundle older than
   the fix version — `src/platforms/mobile/web-bundle-updates.ts`.
2. `scripts/verify-no-web-config.cjs` — unzip APKs and `.asar` archives before scanning,
   remove the silent size skip, and fail (not skip) when a named target is missing.
3. Add a post-release scan of the published R2 objects to both workflows.
4. `vite.config.ts` — replace the name list with a deny-by-default rule for device builds so a
   new `VITE_*` in `.env` cannot leak; keep the existing defines as the floor.
5. `package.json` — delete or redirect the legacy `desktop:build` / `desktop:package` /
   `desktop:installer` scripts that bypass the scrub and the verification step.
6. Version bump via `node scripts/bump-version.cjs`.

Untouched by that fix: web build, Cloudflare deploy, database schema, all POS logic.
