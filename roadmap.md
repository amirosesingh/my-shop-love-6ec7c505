# Roadmap

## In progress — platform configuration isolation (forensic audit fix)
- [ ] Device build env isolation: `envDefine: false` + `envDir` for MOBILE_BUILD / DESKTOP_BUILD
- [ ] Android OTA bundle epoch + invalidation/purge of pre-fix bundles
- [ ] Archive-aware `verify-no-web-config.cjs` (.zip / .apk / .asar, fail on unreadable)
- [ ] Windows parity: verification over renderer, app.asar, installer
- [ ] Legacy release commands redirected to the protected build path
- [ ] Workflows publish the bundle epoch and verify the OTA zip before R2 upload
- [ ] Clean builds + artifact evidence, version bump
