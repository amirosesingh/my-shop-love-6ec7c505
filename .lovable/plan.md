# Final configuration isolation + configuration-first startup

Most of the build isolation already shipped (v1.3.92/1.3.93): device builds use an empty
`envDir`, `envDefine: false`, blanked web env names, scrubbed process env, an OTA epoch, and
an archive-aware artifact scanner. What is still missing is the **runtime half**: Android and
Windows today show a *dismissible* "Cloud Sync Setup Required" dialog, and the repository
`.env` still holds the web tenant values. This plan closes those.

## 1. Audit report (no guessing, no secret values)

Produce the configuration source map by reading every source named in the request: `.env`,
`.env.example`, `vite.config.ts`, `package.json`, `external-supabase-config.ts`,
`backend-config.ts`, `server-origin.ts`, `secure-cloud-config.ts`, the mobile/desktop build
scripts, Electron stores (`config-store`, `cloud-credentials`, `db-config-store`, `updater`),
Capacitor/secure storage, terminal activation, the OTA updater, both workflows and
`wrangler.jsonc`. Each row: variable, current source, needed by Web / Android / Electron,
present in Cloudflare, action. Values are never printed — only names and presence.

## 2. Cloudflare as the only web source

The web resolver already prefers injected runtime values (`setRuntimeEnv` from the Worker) over
build-time ones, so Cloudflare variables work without a rebuild. The plan:

- List the exact names the web build needs (`VITE_POS_SUPABASE_URL` /
  `VITE_POS_SUPABASE_ANON_KEY` or their runtime equivalents `SUPABASE_URL` / `SUPABASE_ANON_KEY`,
  plus server-only `POS_SUPABASE_SERVICE_ROLE_KEY` and `SETTINGS_ENCRYPTION_KEY`) and report a
  **MISSING CLOUDFLARE VARIABLES** section for anything Cloudflare does not already provide.
- Remove the two tenant lines `VITE_POS_SUPABASE_URL` / `VITE_POS_SUPABASE_ANON_KEY` from the
  tracked `.env` and document them in `.env.example` instead, so the repository stops being the
  authoritative web source. The four `VITE_SUPABASE_*` / `SUPABASE_*` lines are platform-managed
  and are left untouched; the Lovable preview keeps working through them.
- Removal happens only after the report confirms Cloudflare supplies the pair; if it does not,
  the report says so and the removal is held back rather than breaking the deployment.

## 3. Configuration-first startup (the main functional change)

New shared module `src/lib/platform-config-ready.ts`:

- `hasRequiredPlatformConfig()` — terminal only. Reads the existing secure stores
  (`cloudKeyStatus()` for Electron safeStorage / Android Keystore, plus the sealed terminal
  activation and the saved backend URL) and returns `ready | missing | invalid` with a reason.
  No network, no web env, no baked fallback. Web always returns `ready`.
- `subscribeConfigReady()` so saving keys flips the state instantly.

Wiring:

- `CloudSetupGate` becomes a **blocking setup gate** on terminal apps: when the check is
  `missing`/`invalid` it renders the setup screen (Recovery Hub → Cloud Keys / Local SQL /
  Backend address) instead of the app, with no "Continue Offline" escape into backend-dependent
  screens. This is an unconfigured-terminal state, not an error page; local-only screens and
  Emergency Access stay reachable.
- `NativeBoot` (Android) checks readiness before hydrating sync, terminal registration and OTA
  operations that need the backend, and routes straight to setup when missing.
- Electron start-up uses the same check before registration/login/database/sync; the existing
  `onCloudSetupRequired` shell event opens the same screen.
- After the user enters values: validate against the entered project (existing
  `createTenantClient` probe), save through the existing secure store, then continue to terminal
  registration/login. No second configuration system is introduced.

Nothing is removed: forms, validation, storage, registration, login and backend logic all stay.

## 4. Build isolation verification (already implemented, now proven)

- Re-confirm `mobile:build` (`MOBILE_BUILD=1`) and `desktop:release` (`DESKTOP_BUILD=1`) scrub
  the web names and that the Lovable wrapper cannot re-inject them (`envDefine: false`).
- `npm run build`, `dev`, `build:dev`, `lint` stay exactly as they are.
- Run the actual builds in this sandbox where possible and run the archive-aware scanner over
  what is produced (`capacitor-shell/`, `dist/`, `dist-desktop/`, OTA ZIP, `app.asar`). Gradle
  APK assembly and electron-builder packaging cannot run here — those scans stay wired into the
  two workflows before the R2 upload, and the report states plainly which scans ran where.

## 5. OTA and workflows

- Keep the epoch mechanism: stored bundles below the compiled epoch are rejected, their files
  deleted and the selection cleared, so a pre-fix bundle can never override a clean APK.
- Confirm the Android workflow's optional `app_url` hosted-loading input cannot ship a web-backed
  APK in the release path; if it can, it is gated to non-release builds.
- Confirm both workflows verify the final artifact and the staged OTA ZIP **before** upload and
  stop on failure, and that no restored cache can reintroduce an older artifact.

## 6. Final report

Sections A–I exactly as requested, including the configuration-first acceptance results, with
each item marked as verified here or verified in CI, and no secret values anywhere.

## Technical notes

Files expected to change: `src/lib/platform-config-ready.ts` (new),
`src/platforms/web/components/pos/CloudSetupGate.tsx`,
`src/platforms/mobile/components/NativeBoot.tsx`, `src/platforms/web/components/pos/AppShell.tsx`,
`.env` / `.env.example`, possibly `scripts/verify-no-web-config.cjs` and the two workflows, plus
new tests for the readiness gate. No schema, no UI redesign, no business-logic change. Version
bumped with `node scripts/bump-version.cjs`.
