# Remove the artifact scanner so Android and Windows builds stop failing

## Why the build stops today

The Windows build is not stopped by Vite or by a real Cloudflare value. It is stopped by
`scripts/verify-no-web-config.cjs`, which prints “Android and Windows builds must ship no web
environment values” and exits with an error.

Its rule that flags any JWT-shaped text as leaked key material matches harmless sample tokens
inside packaged dependency source files (Zod test fixtures, which appear in several copies of that
dependency). Running the scanner against one of those files reproduces the exact failure, even
though the token is not project configuration and contains no privileged claim.

Your decision: remove the check entirely. That is safe for building, because the scanner only
inspects finished artifacts; it never produced any configuration.

## What will be removed

- `scripts/verify-no-web-config.cjs`.
- The scanner steps inside `scripts/mobile-build.cjs` and `scripts/desktop-release.cjs`.
- The scanner steps in the Android and Windows GitHub Actions workflows.
- Test assertions that require the scanner to exist.

The mobile and desktop build scripts themselves stay. They are not checks: `mobile-build.cjs`
renders the offline shell that becomes the APK, and `desktop-release.cjs` produces `dist-desktop`
and the installer. Removing those would stop Android and Windows from building at all.

## What stays in place, so removal does not reopen the original problem

These are build-time behaviors, not blocking scans, and they keep working without the scanner:

- `vite.config.ts` keeps `envDefine: false`, the empty `envDir`, and blank definitions for Web
  variable names on `MOBILE_BUILD` / `DESKTOP_BUILD`.
- Both build scripts keep removing Web-only variables from the build environment. This list will be
  extended to also cover the canonical unprefixed names (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
  the legacy publishable/service-role aliases), which are currently missed.
- The Android prerender step will run with the same cleaned environment, and will still refuse to
  emit a shell containing injected cloud configuration. This is a build-script behavior, not the
  removed scanner.
- Android and Windows continue to read their URL and key only from secure per-device storage, and
  the configuration-first setup screen still opens when they are missing.

## Web keeps working from Cloudflare

Deployed Web gets `SUPABASE_URL` and `SUPABASE_ANON_KEY` from Cloudflare at request time; the server
passes them to the configuration module and prints only the public pair into the page. No repository
environment file is required for production Web, so builds will not fail if `.env` is absent, and
`.env.example` stays value-free.

## Also included

- Fix the captured preview error “useUserPermissions must be used inside PermissionsProvider” by
  making the permissions context stable across module duplication and hot reload, matching the
  existing auth and register-store pattern.
- Update `roadmap.md` to record that artifact scanning was removed by request and that Web
  configuration comes from Cloudflare only.

## Verification

- Run a clean desktop-mode build and confirm it completes with no scanner step and no failure.
- Run the mobile build path far enough to confirm the shell renders and contains no injected cloud
  configuration.
- Confirm the Web preview still loads and receives its configuration at runtime.
- Run the full test suite after removing scanner-dependent assertions.
- Bump the version once at the end.

## Files expected to change

`scripts/verify-no-web-config.cjs` (deleted), `scripts/mobile-build.cjs`,
`scripts/desktop-release.cjs`, `.github/workflows/android-apk.yml`,
`.github/workflows/desktop-release.yml`, `src/lib/__tests__/device-build-isolation.test.ts`,
`src/lib/pos-permissions.tsx`, `roadmap.md`, and the version files.

No business logic, database schema, activation flow, device configuration storage, or Cloudflare
variable names change.
