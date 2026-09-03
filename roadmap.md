# Roadmap

## In progress — platform configuration isolation (forensic audit fix)
- [x] Device build env isolation: `envDefine: false` + `envDir` for MOBILE_BUILD / DESKTOP_BUILD
- [x] Android OTA bundle epoch + invalidation/purge of pre-fix bundles
- [x] Archive-aware `verify-no-web-config.cjs` (.zip / .apk / .asar, fail on unreadable)
- [x] Windows parity: verification over renderer, app.asar, installer
- [x] Legacy release commands redirected to the protected build path
- [x] Workflows publish the bundle epoch and verify the OTA zip before R2 upload
- [x] Clean builds + artifact evidence, version bump
