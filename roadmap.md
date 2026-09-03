# Roadmap

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

## Open (needs your input, not code)
- [ ] Production Web reads canonical `SUPABASE_URL` / `SUPABASE_ANON_KEY` from the Cloudflare
      Worker — confirm both are set there. No repository `.env` is required for a Web build.

