# Update feed, one-time setup, and a single Settings home

## 1. Point the tills at your real update folder

The update URL is only supplied through a build-time variable today, so any installer built without it falls back to a placeholder and the till reports "No update feed is configured for this build."

- Bake `https://updatecms.luckycharmsdnbhd.com/pos-app/` in as the default feed in the release script and the installer config, so a plain build already knows where to look. An env override stays possible for testing.
- Add the same URL as a last-resort fallback in the updater, so even an installer that has no feed baked in still finds updates.
- After this, "Check for updates" reads `latest.yml` from that folder, downloads in the background and installs on restart. Rollback downloads from the same folder.

## 2. A dedicated "Software updates" page

App updates and System health currently sit at the bottom of Display & text size.

- New page: Settings → Software updates — current version, update status and progress, Check now, Restart and install, plus the System health / rollback card.
- Those two cards are removed from the Display page, which goes back to scaling, theme and printer only.

## 3. Company name should be asked once, ever

Root cause: the desktop shell starts its local app server on a random free port each launch, so the browser origin changes every time and everything kept in browser storage — including the "setup complete" flag — is discarded. That is why first-run setup reappears after every restart.

- Pin the local server to a fixed loopback port (with an automatic fallback if it is busy) so the origin is stable across launches. This also preserves display scale, theme, printer choice and other local preferences that were silently resetting.
- Mirror the company / terminal name and the "configured" flag to a file in the app's data folder, the same way terminal activation is already mirrored, and restore it on launch. Even a cleared cache or an in-place update then keeps the branding.
- The setup screen still shows on a genuinely fresh install, and the names remain editable in Settings → Business identity.

## 4. One Settings entry in the menu

- The sidebar keeps a single "System & Settings" item; the eleven individual settings links are removed from the menu.
- The Settings hub becomes the complete index: existing cards plus the ones missing today — Terminal activation and Software updates — each opening its own page.
- Every settings page keeps its back link to the hub, so the menu is not needed to move between them. Existing settings URLs continue to work unchanged.

## Technical notes

- `scripts/desktop-release.cjs` + `package.json` `build.publish.url`: default to the real URL instead of the example placeholder; `electron/updater.cjs` gains the same constant as final fallback after `bakedFeed()`.
- `electron/main.cjs`: replace `freePort()` with a preferred fixed port (e.g. 43117), falling back to a scan only if it is taken.
- `electron/branding-store.cjs` (new, modelled on `terminal-store.cjs`) plus `branding:read` / `branding:write` IPC and preload methods; `src/lib/branding.ts` restores from the mirror on startup and writes through to it.
- New route `src/routes/settings.updates.tsx` hosting `AppUpdateSettings` and `SystemHealthCard`; both removed from `settings.display.tsx`.
- `src/components/pos/nav-config.ts`: drop the per-page settings items, keep `/settings`; `settings.index.tsx` gains the terminals and updates cards (terminals stays hidden in the desktop build).