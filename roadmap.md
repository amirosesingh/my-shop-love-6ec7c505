# Roadmap

## Harden, complete and simplify the POS (approved 2026-09-05)
- [x] Phase 1 — Groups become real records, branch picks a group, backfilled
- [x] Phase 2 — Cross-group transfers always need someone else's approval (enforced in the database)
- [x] Phase 3 — Terminals screen shows status, version, last seen, last sync; this-device panel; clear terminal revokes centrally
- [x] Phase 4 — Sync you can act on (one panel, failed list, retry, replay protection)
- [x] Phase 5 — Settings reorganisation and controlled values (ten categories, folding navigation, retire units and categories)
- [x] Phase 6 — Server-side access review and final report (report: /mnt/documents/pos-hardening-report.md)
- [x] Private catalogue carry-over checked: no old per-product owner list exists (settings empty,
      no branches flagged private, 0 of 15 products owned) — nothing to migrate

## PC and Android setup/login loop (v1.3.129) — done
- [x] Prevent authentication from starting before secure device configuration is ready
- [x] Route fresh installs through API configuration, activation, then login
- [x] Keep Emergency Access hidden only on a completely fresh install
- [x] Verify recovery, retry, activation, and subsequent-launch flows

## Platform configuration isolation — done
- [x] Device build env isolation: `envDefine: false` + empty `envDir` for MOBILE_BUILD / DESKTOP_BUILD
- [x] Shared `scripts/web-only-env.cjs` strips web names (canonical + legacy) from every
      terminal build child process: Vite, the Android prerender server, the packager
- [x] Android prerender still refuses to emit a shell carrying injected cloud configuration
- [x] Android OTA bundle epoch + invalidation/purge of pre-fix bundles
- [x] Artifact scanner removed by request (2026-09-03): `verify-no-web-config.cjs` and its
      build/workflow steps are gone. It only inspected finished artifacts and was failing on
      JWT-shaped sample tokens inside packaged dependencies, blocking Windows builds.

## Configuration-first startup (v1.3.94) — done
- [x] `platform-config-ready.ts` local readiness check (no network, no web env)
- [x] Blocking terminal setup gate (no "Continue Offline"), Emergency Access preserved
- [x] Sync engine + Android OTA hold off until the device is configured
- [x] Hosted-shell (`app_url`) Android builds cannot publish to R2 / GitHub release

## Device storage lifecycle (v1.3.98) — done
- [x] Windows: `electron/storage-hygiene.cjs` prunes Chromium scratch on every launch and
      completely on the first launch after a version change; identity, sealed credentials,
      settings and the local mirror are never touched
- [x] Windows uninstall removes application data (`nsis.deleteAppDataOnUninstall`)
- [x] Android: Auto Backup and device transfer disabled in the manifest patcher, so a
      reinstall can no longer be restored with an old activation
- [x] Android: launch cleanup drops leftover downloaded APKs and derived cache keys,
      keeping activation, device key, configuration, preferences and the open ticket

## Open (needs your input, not code)
- [ ] Production Web reads canonical `SUPABASE_URL` / `SUPABASE_ANON_KEY` from the Cloudflare
      Worker — confirm both are set there. No repository `.env` is required for a Web build.


- Emergency codes admin screen (/settings/emergency-codes): tills escrow their recovery secret encrypted; owner-only reveal returns only the live six digits; per-company master salt replaces the build-time salt. (v1.3.99)
