# Safe mode and automatic rollback after a bad update

If an update leaves the till unable to start, the app detects it on the next launch, stops the update loop, and offers a one-click roll back to the last version that worked — without ever touching the terminal registration, the local database, or settings.

## How it behaves

**Detecting a bad start**
- Every launch writes a "pending" marker before any window opens.
- The till clears that marker only once the register screen has actually mounted and reported in.
- A launch that crashes, white-screens, or hangs leaves the marker behind. The next launch sees it and counts a failure.
- One failure: launch normally again (transient problems shouldn't lock anyone out). Two consecutive failures: safe mode.

**Safe mode**
- Instead of the till, a recovery window opens: which version is installed, what the last working version was, when it failed, and why.
- Automatic updates are paused while in safe mode, so a broken build can't reinstall itself in a loop.
- Buttons: **Roll back to <last working version>**, **Try starting again**, **Open log folder**, **Close**.
- A clear note that registration, local data and settings are preserved.

**Rollback**
- Downloads the installer for the last known-good version from the same update feed the app already uses (GitHub releases or the plain URL folder), with a progress readout, then runs it silently and quits so it can reinstall in place.
- If no feed is configured, or no earlier good version was ever recorded, the rollback button is disabled with an explanation and retry stays available.

**Terminal registration is never lost**
- The activation is already mirrored to a file in the app's user-data folder, which installers and rollbacks do not remove. On the next successful start the till rehydrates from that mirror, so no re-registration and no new token.

**Also covered**
- If the internal app server fails to start, the app shows the recovery window instead of an error box and quitting — so there is always a way back.
- A "System health" card in Settings → Display shows the running version, the last known-good version, recent failed starts, and a manual "Roll back to previous version" action for the case where the app starts but is visibly broken.

## Technical outline

- `electron/health.cjs`: boot-health record in `userData/boot-health.json` — `version`, `pending`, `failures`, `lastGoodVersion`, `lastGoodAt`, `lastFailureAt`, `reason`; `beginBoot()`, `markHealthy()`, `markFailed()`, `reset()`, `shouldEnterSafeMode()` at a 2-failure limit.
- `electron/recovery.html` + `electron/recovery.cjs`: safe-mode window with its own `recovery-preload.cjs` exposing `state / rollback / retry / openLogs / quit` plus a download-progress channel.
- `electron/updater.cjs`: add `rollback(version)` — resolve the artifact URL from the configured feed (`github` → `releases/download/v<version>/<Product> Setup <version>.exe`; generic → `<url>/<Product> Setup <version>.exe`), download through Electron `net` to a temp file, spawn it with `/S`, then quit. Add `pause()` so safe mode suppresses checks.
- `electron/main.cjs`: call `health.beginBoot()` before creating windows; on `shouldEnterSafeMode` open the recovery window and skip `updater.start()`; otherwise run a 60s watchdog that calls `health.markFailed("Startup timed out")` and opens recovery if the renderer never reports ready; route app-server startup failure to the same window. New IPC: `app:ready`, `health:state`, `health:rollback`, `health:reset`.
- `electron/preload.cjs`: expose `reportReady()`, `healthState()`, `rollbackNow()`.
- `src/components/pos/AppShell.tsx`: one mount effect calling `window.pos?.reportReady()` — this is the healthy signal.
- `src/lib/app-health.ts` + `src/components/pos/SystemHealthCard.tsx`, mounted in `src/routes/settings.display.tsx`.
- `docs/windows-desktop.md`: safe-mode and rollback section.