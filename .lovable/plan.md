# Fix Android/Windows configuration scanning without weakening isolation

## Confirmed findings

1. **The stopping message comes from the artifact scanner, not Vite itself.**
   `scripts/verify-no-web-config.cjs` prints “Android and Windows builds must ship no web environment values” and exits with code 1 after scanning `dist-desktop`, the Electron release, APK, and OTA ZIP outputs.

2. **The scanner has a reproducible false positive.**
   It currently treats every JWT-shaped string as a leaked service-role key. The packaged dependency tree contains harmless JWT test fixtures in Zod source files. Running the scanner directly against one of those fixtures reproduces the exact failure, although its decoded payload has no `service_role` claim and is not project configuration.

3. **Terminal builds already block Vite’s normal Web injection, but the environment scrub is incomplete.**
   `vite.config.ts` correctly uses `envDefine: false`, an empty `envDir`, and explicit blank `VITE_*` definitions for `MOBILE_BUILD`/`DESKTOP_BUILD`. However, the mobile and desktop build scripts currently delete only Vite-prefixed aliases. They do not remove canonical Web runtime names such as `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and legacy publishable/service-role aliases from inherited build and prerender environments.

4. **Android prerender is the important remaining path.**
   `scripts/mobile-build.cjs` launches the built server with inherited `process.env`. During that server render, Web runtime configuration can be resolved and printed into `window.__POS_CONFIG__`; the script only removes that tag afterward. Prevention should happen before rendering, with the existing post-render removal retained as defense in depth.

5. **Cloudflare Web configuration does not require a repository environment file.**
   `src/server.ts` receives Cloudflare variables per request, calls `setRuntimeEnv(env)`, and `public-config-script.ts` injects only the public URL/key into the browser page. Production Web therefore continues to use `SUPABASE_URL` and `SUPABASE_ANON_KEY` from Cloudflare even when terminal builds receive no Web environment values.

6. **Android and Windows device configuration remains independent.**
   Windows loads URL/key from the OS-sealed credential store; Android uses its secure platform store. The existing configuration-first gate opens setup when those values are absent. These paths do not need redesign.

## Implementation

### 1. Centralize and fully scrub Web-only build variables

- Create one shared CommonJS build-isolation helper for the canonical Web variables plus known legacy aliases.
- Use it from both `scripts/mobile-build.cjs` and `scripts/desktop-release.cjs`, eliminating duplicated lists.
- Remove canonical Web values and privileged aliases from the environment passed to every terminal `vite build`, Android SSR/prerender child, and Electron packaging child.
- Preserve only terminal-safe inputs such as `MOBILE_BUILD`, `DESKTOP_BUILD`, signing values, and `POS_UPDATE_URL`.
- Keep `vite.config.ts` terminal protections (`envDefine: false`, empty `envDir`, blank static Vite reads) as an independent layer.

### 2. Prevent Web configuration resolution during terminal prerender

- Make the device-build identity explicit in the server-render environment rather than relying on browser-only platform detection.
- Ensure `external-supabase-config.ts` cannot read Cloudflare/Web environment bags while rendering a mobile or desktop artifact.
- Keep the existing removal/check for `window.__POS_CONFIG__` in the generated Android HTML as a final assertion, not the primary protection.
- Do not alter normal Web resolution: deployed Web continues to receive canonical values from Cloudflare request-time variables.

### 3. Correct the scanner’s false-positive logic

- Continue failing on exact configured tenant values, real `sb_publishable_`/`sb_secret_` material, project hosts, unreadable archives, and nested APK/ZIP/ASAR contamination.
- Replace the generic “any JWT-shaped text” rule with semantic JWT inspection: flag a token only when its decoded payload indicates privileged database credentials (for example `role: service_role`) or when it exactly matches a known forbidden configured value.
- Report the matched artifact entry and reason clearly, without printing key values.
- Add retry-safe file reads where packaging can briefly hold a file, while still failing closed after bounded retries.

### 4. Tighten Electron packaging

- Replace the unrestricted `node_modules/**` package inclusion with production dependency packaging/exclusions that deliberately omit dependency source tests, fixtures, maps, docs, and caches.
- Retain all runtime/native modules required by Electron, SQL Server, printing, and updates, including current `asarUnpack` requirements.
- Scan both unpacked application content and the final installer before any upload or GitHub release action.

### 5. Keep environment ownership explicit

- Treat `.env.local` as local-development-only and keep it ignored.
- Do not make Android or Windows depend on any repository `.env` file, even if the platform regenerates one in the workspace.
- Keep `.env.example` value-free and document only:
  - Web production: `SUPABASE_URL` and `SUPABASE_ANON_KEY` from Cloudflare.
  - Server secrets: Cloudflare secret storage only.
  - Android/Windows: user-entered, validated, OS-secured device configuration only.
- Do not print or copy any actual URL/key during tests or reports.

### 6. Regression coverage and verification

- Add scanner tests for:
  - harmless JWT fixtures pass;
  - a JWT with `service_role` fails;
  - exact tenant URL/key values fail;
  - fake Supabase-shaped examples that are not configured secrets do not cause misleading failures;
  - ZIP/APK/ASAR entries are still inspected and unreadable archives fail closed.
- Expand build-isolation tests to verify canonical unprefixed names are scrubbed from both build scripts and terminal prerender children.
- Build fresh mobile and desktop renderer outputs from clean directories and scan them.
- Verify the Web preview still receives only `SUPABASE_URL`/`SUPABASE_ANON_KEY` through runtime injection and returns successfully without build-time Web values.
- Verify missing Android/Windows credentials still open configuration setup and saved credentials still come from secure device storage.
- Address the captured preview provider-context error by making the permissions context stable across hot reload/module duplication, matching the existing auth and POS context pattern, then verify the register renders inside its provider.
- Run targeted tests, the full test suite, and bump the app version once after all checks pass.

## Files expected to change

- `scripts/verify-no-web-config.cjs`
- `scripts/mobile-build.cjs`
- `scripts/desktop-release.cjs`
- a new shared build-isolation helper under `scripts/`
- `vite.config.ts` only if needed to consume the shared canonical list safely
- `src/lib/external-supabase-config.ts`
- `package.json`
- `.env.example`
- build-isolation/scanner tests
- `src/lib/pos-permissions.tsx` for the captured preview provider-context error
- `roadmap.md`, `src/version.ts`, and package version metadata

No business logic, database schema, activation flow, secure device configuration, or Cloudflare variable names will change.
