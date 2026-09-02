# Standalone Android app, split app folders, and a full audit report

## Answering your question first: is the phone app separate code?

No. Today there is one codebase and one set of screens. The Android app is a Capacitor wrapper: `scripts/mobile-build.cjs` builds the same web app, renders the shell to HTML and drops it into `capacitor-shell/`. Windows (Electron) does the same with the same screens. Platform differences are 69 scattered `isNative()` / `isElectron()` checks across 22 files — there is no "mobile app", just conditionals.

## Why every install lands in your database

Two things bake your tenant into the shipped app:

1. `src/lib/external-supabase-config.ts` hardcodes a `POS_PROJECT` constant holding your project URL and publishable key as the primary source, ahead of every environment variable.
2. The phone bundle's `index.html` is rendered by a running server, and that render writes a `window.__POS_CONFIG__` script containing the resolved public URL and key straight into the APK. The Android CI build also bakes a server address (`VITE_POS_SERVER_URL`) that points at your hosted backend, which holds the service key.

So any APK you hand to a buyer already knows your project and your server. That is the mixing risk.

## Part 1 — Tenant-neutral builds (the actual fix)

- Remove the hardcoded `POS_PROJECT` constant. The web deployment keeps working from its environment variables; nothing is baked into source.
- The phone/desktop shell HTML is generated with the config script omitted, so no URL or key ships inside the APK or the installer.
- No baked backend address for distributable builds; the device learns it during provisioning.
- Fresh install = blank: no database is known. First launch shows **Connect to database** (URL + key, or scan an activation QR), then **Terminal activation**, then Login — the flow already built in v1.3.84, now with nothing to short-circuit it.
- A build-time check fails the mobile/desktop build if any tenant value made it into the output, plus a test asserting the shipped shell contains no `__POS_CONFIG__` payload.

## Part 2 — Separate mobile and Windows app folders

Same repo, one core, but each shell owns its own entry, routes and chrome:

```text
src/
  core/        shared domain: sales, shifts, inventory, sync, auth, printing
  apps/
    mobile/    Android entry, route set, layout, nav, boot
    desktop/   Windows entry, route set, layout, nav, boot
    web/       browser back-office (today's routes)
```

- Phone keeps every feature the web has (your choice), but the screens live in `apps/mobile` so they can diverge — touch layout, phone nav, phone-only boot — without touching web or Windows.
- The scattered `isNative()` / `isElectron()` branches move out of shared components and become folder boundaries; the ones that must stay (hardware, storage) are consolidated behind small capability helpers.
- Build scripts pick the entry: `MOBILE_BUILD` uses `apps/mobile`, the Electron build uses `apps/desktop`, the web build uses `apps/web`.
- This is a large refactor. It is staged: shared core extraction first, then mobile folder, then desktop folder — each stage keeps the app running and the test suite green.

## Part 3 — Full audit report (written first, no fixes yet)

A single markdown report at `docs/audit/full-audit-2026-09.md` covering all three platforms:

- **Security**: hardcoded tenant credentials, baked keys in build artefacts, the public `/api/public/*` endpoints and what authenticates each, service-key handling in the relay, secret sealing on each platform, emergency PIN strength, database row-security and grant gaps (run against the live project), dependency vulnerabilities.
- **Incomplete features**: screens that exist but are unreachable, features that silently no-op on a platform (printing, drawer, local SQL on phone/web), settings that save nowhere, sync tables with no restore path.
- **Correctness flaws**: duplicated logic, unhandled failure paths in checkout/sync, places where an offline failure is reported as an activation failure, hydration mismatch currently in the console.
- Each item ranked Critical / High / Medium / Low with file references and a one-line fix, so you choose what gets done next.

Order of work: audit report (Part 3) → tenant-neutral builds (Part 1) → folder split (Part 2), unless you want the split first.

## Technical notes

- Files central to Part 1: `src/lib/external-supabase-config.ts`, `src/lib/public-config-script.ts`, `scripts/mobile-build.cjs`, `.github/workflows/android-apk.yml`, `src/lib/backend-config.ts`, `src/routes/__root.tsx`.
- Existing guards help: `supabaseConfig()` already refuses bundle/environment values on terminal apps, and `own-database.security.test.ts` already bans hardcoded project URLs outside the config owner — removing `POS_PROJECT` brings that file into line with its own rule.
- Part 2 keeps `src/routes` as the generated TanStack route tree; per-app route sets are composed there through per-platform route registration rather than three route trees.
- Version bump via `node scripts/bump-version.cjs` on each shipped stage.
