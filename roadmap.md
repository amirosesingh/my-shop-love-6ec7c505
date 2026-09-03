# Roadmap

## In progress — platform configuration isolation (forensic audit fix)
- [x] Device build env isolation: `envDefine: false` + `envDir` for MOBILE_BUILD / DESKTOP_BUILD
- [x] Android OTA bundle epoch + invalidation/purge of pre-fix bundles
- [x] Archive-aware `verify-no-web-config.cjs` (.zip / .apk / .asar, fail on unreadable)
- [x] Windows parity: verification over renderer, app.asar, installer
- [x] Legacy release commands redirected to the protected build path
- [x] Workflows publish the bundle epoch and verify the OTA zip before R2 upload
- [x] Clean builds + artifact evidence, version bump

## Configuration-first startup (v1.3.94) — done
- [x] `platform-config-ready.ts` local readiness check (no network, no web env)
- [x] Blocking terminal setup gate (no "Continue Offline"), Emergency Access preserved
- [x] Sync engine + Android OTA hold off until the device is configured
- [x] Hosted-shell (`app_url`) Android builds cannot publish to R2 / GitHub release

## Open (needs your input, not code)
- [ ] Decide whether `.env` may drop `VITE_POS_SUPABASE_URL` / `VITE_POS_SUPABASE_ANON_KEY` —
      only safe once the Cloudflare Worker has SUPABASE_URL / SUPABASE_ANON_KEY set there.
- [ ] Real APK / Electron installer scan runs in GitHub Actions only (sandbox cannot package).
