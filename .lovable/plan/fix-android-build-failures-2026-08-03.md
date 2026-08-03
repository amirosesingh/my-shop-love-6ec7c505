# Fix Android build failures

## Goal
Make the offline Capacitor APK build succeed both on Windows PCs and in GitHub Actions without externalizing native plugins or weakening the offline package.

## Changes
1. **Make Capacitor dependencies reproducible**
   - Keep `@capacitor/preferences`, Filesystem, App, and the file opener declared in `package.json`.
   - Refresh the dependency lock so a normal install on Windows and CI installs the plugins before Vite resolves `mobile-storage.ts`.
   - Document the one-time clean install/sync commands for an existing Windows checkout with stale `node_modules`.

2. **Align mobile build output**
   - Give the `MOBILE_BUILD=1` Nitro node-server build explicit output directories matching the mobile packager’s contract: `dist/server` and `dist/client`.
   - Keep ordinary cloud builds and Electron’s separate `dist-desktop` output unchanged.

3. **Harden the mobile packager**
   - Validate the generated server entry and client assets with clear path-specific errors.
   - Preserve the current flow: start the temporary local renderer, capture the app shell, copy assets into `capacitor-shell`, and then let Capacitor sync them into Android.

4. **Keep CI and local instructions consistent**
   - Update the Android workflow/install guidance to use the committed dependency lock consistently.
   - Clarify that the 500 kB chunk notice is non-fatal and separate from these build errors; no unsafe module externalization will be added.

## Verification
- Run the mobile bundle command and confirm it creates `capacitor-shell/index.html` plus client assets.
- Run Capacitor sync and the Android debug APK build.
- Confirm the regular web build still uses its existing cloud target and the desktop build still uses `dist-desktop`.

## Technical notes
- `@capacitor/preferences` must be bundled and installed; adding it to Rolldown `external` would defer the failure to runtime.
- The current GitHub failure occurs after a successful Nitro build because Nitro emits `.output`, while `scripts/mobile-build.cjs` checks `dist/server/index.mjs` and `dist/client`.