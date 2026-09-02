# Part 2 — Platform split: the read-first map (no files moved yet)

This is section 0 only: the proposed map plus the ambiguities that need a decision
before anything moves. No code changes are made until you confirm.

## What the codebase looks like today

- One app, one route tree: `src/routes/` (97 files) is generated into
  `src/routeTree.gen.ts` by the TanStack Router plugin. All three shells (browser,
  Electron, Capacitor) serve the same routes from the same SSR entry (`src/server.ts`).
- `src/lib/` holds 229 files mixing shared domain logic, cloud access, Electron
  bridges and Capacitor bridges.
- 22 files contain `isNative()` / `isElectron()` branches.
- `electron/` already exists and is substantial (SQL Server driver, safeStorage,
  recovery window, updater). `android/` does **not** exist in this repo — the
  Capacitor native project is generated in CI; only `capacitor-shell/` is committed.

## Proposed destinations (folder-level map)

| Current | Destination | Used by |
| --- | --- | --- |
| `src/integrations/supabase/*`, `src/lib/pos-relay.server.ts`, `pos-db.ts`, `db-query.ts`, `db-router.ts`, `*.functions.ts` / `*.server.ts` | `src/core/api` | all |
| `activation-record.ts`, `registration-status.ts`, `terminal-tokens.ts`, `terminal-activation-log.ts`, `connection-health.ts` | `src/core/activation` | all |
| `tax.ts`, `rounding.ts`, `profit.ts`, `amount.ts`, cart total helpers in `pos-store.tsx`, `booking-charges.ts` | `src/core/pricing` | all |
| `local-db.ts`, `local-drift.ts`, `local-staff.ts`, `db-mode.ts`, `backup-sql.ts`, `driver-install.ts` | `src/core/local-db` (Windows-only consumers) | windows |
| `pos-types.ts`, `payment-types.ts`, `feature-schema.ts` | `src/core/types` | all |
| `src/hooks/*`, non-rendering hooks in `src/lib/register/` | `src/core/hooks` | all |
| `src/components/**`, `src/routes/**` (today's screens) | `src/platforms/web` | web |
| `mobile-storage.ts`, `native.ts`, `native-http.ts`, `android-updates.ts`, `web-bundle-updates.ts`, `camera.ts`, `components/mobile/*`, `NativeBoot.tsx`, `AndroidUpdateBanner.tsx`, `MobileStatusSheet.tsx` | `src/platforms/mobile` | mobile |
| `desktop-window.ts`, `WindowControls.tsx`, `LocalDatabaseSettings.tsx`, `DbConnectionModal.tsx`, `DriverInstallPanel.tsx`, `SqlAdminBadge.tsx`, Electron halves of `secure-cloud-config.ts` / `emergency-pin.ts` / `receipt-printer.ts` | `src/platforms/windows` | windows |
| new | `src/platform-config/features.ts` | all entry points |
| `electron/` | stays at `electron/` (already exists, not greenfield) | windows |

Split files (one file, two platform halves — `secure-cloud-config.ts`,
`emergency-pin.ts`, `receipt-printer.ts`, `bill-number.ts`, `live-mode.ts`,
`backend-config.ts`, `server-origin.ts`, `layout-store.ts`, `update-manifest.ts`)
become a `core` interface plus a per-platform implementation selected at the entry
point, so `isElectron()`/`isNative()` disappears from shared code.

## Ambiguities that need your decision before the move

1. **Routes cannot simply move.** TanStack Router owns `src/routes/` and generates
   `src/routeTree.gen.ts`; there is one tree, and the SSR entry, Electron shell and
   phone shell all render it. Moving routes under `src/platforms/web/routes` and
   adding per-platform trees is the single highest-risk part of this plan and is
   what could break the Cloudflare deploy. Safer shape, same outcome: keep
   `src/routes/` as the thin generated tree, and have each route file be a
   one-line re-export of a screen living in `src/platforms/<platform>/screens/`,
   with platform-specific screens registered per build flag.
2. **Windows is not greenfield.** `electron/` is a full app today (SQL Server,
   safeStorage, recovery, updater) and `desktop-release.yml` already builds it with
   electron-builder. The prompt describes creating it fresh; instead I would keep
   and re-path the existing one, and update `desktop-release.yml` rather than add
   `windows-build.yml`. Confirm which you want.
3. **`android/` is not in the repo.** The Capacitor Android project is generated in
   CI from `capacitor-shell/`. A `paths:` filter on `android/**` would never fire;
   I would filter on `capacitor-shell/**` + `scripts/mobile-build.cjs` instead.
4. **`core/local-db` already exists in substance.** The offline SQL layer is real
   (`src/lib/local-db.ts`, `electron/db/*`, `db/offline/migrations`). It is a move,
   not a scaffold. The rule "mobile and web must never import from it" will be
   enforced by a test, and any current cross-import found during the move gets
   listed rather than silently rewired.
5. **Feature flags vs. existing settings.** `src/lib/public-flags.ts` and the
   settings visibility registry already gate features. `platform-config/features.ts`
   should sit above those, not duplicate them.

## Web deploy safety

- Cloudflare keeps running the same command; only what it resolves to changes.
  Build output stays `dist/` with the same Nitro presets in `vite.config.ts`.
- No `.github/workflows/*.yml` for web will be added.
- Nothing under `supabase/` is touched; the diff there must stay empty.

## Migration order (only after this map is confirmed)

1. Create empty folders — build unchanged.
2. Move api + activation → `src/core`, update imports, verify web.
3. Move pricing → `src/core/pricing`, repoint `pos-store.tsx`, `booking-charges.ts`,
   `SettingsFrame.tsx`.
4. Move web screens → `src/platforms/web` (shape depends on decision 1).
5. Move mobile bridges → `src/platforms/mobile`, repoint `scripts/mobile-build.cjs`.
6. Re-path Windows/Electron and stub what is genuinely missing.
7. Workflow `paths:` filters + `platform-config/features.ts` + boundary tests.
8. Version bump via `node scripts/bump-version.cjs`.

Each step is a separate commit, tests run between steps, and nothing merges until a
Cloudflare preview of the new structure serves correctly.
