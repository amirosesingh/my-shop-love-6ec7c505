# Shipping the Windows .exe with automatic background updates

Goal: one tag push produces a downloadable `.exe` installer, and every till already in the field picks up future versions on its own — download in the background, install on restart.

## How releases will work

- A GitHub Actions workflow runs on a Windows runner. Push a version tag (`v1.0.1`) or trigger it by hand, and it builds the desktop bundle, produces the NSIS installer, and uploads the release files as downloadable artifacts.
- Files produced: `LovablePOS Setup <version>.exe`, `latest.yml` (the manifest the tills read), and a `.blockmap` used for smaller delta downloads.
- You download those three files from the workflow run and drop them into your own web folder (for example `https://updates.yourdomain.com/pos/`). That folder is the update feed.
- No code signing for now, so a first-time install shows the Windows SmartScreen "More info → Run anyway" prompt. Signing can be added later by adding a certificate to repo secrets.

## How a till updates itself

- On launch and every 6 hours the app fetches `latest.yml` from that folder, compares versions, and downloads a newer installer in the background.
- Nothing interrupts a shift: when the download finishes the till shows "Update ready — restart to install", and it installs on the next restart. Settings → Display → App updates shows version, progress, and manual "Check now" / "Restart and install".
- The installer reinstalls in place, so terminal registration, settings and the local SQL Server data are untouched — the till comes back already activated.
- If a new build fails to start twice in a row, the existing safe-mode window opens instead, pauses updates, and offers a rollback to the last version that worked.

## What you do once per release

1. Set the update URL for your web folder (one value, used by the build config and the workflow).
2. Push a tag, download the three files from the workflow run, upload them to that folder.
3. Send the `.exe` to each counter for the first install only. Everything after that is automatic.

Step-by-step instructions go into the docs so you don't have to remember it.

## Technical notes

- `package.json`: replace the placeholder `build.publish` generic URL with a build-time value (`POS_UPDATE_URL`, sensible default for local builds); add a `desktop:release` script (`DESKTOP_BUILD=1 vite build && electron-builder --win nsis --publish never`).
- `.github/workflows/desktop-release.yml`: `windows-latest`, Node 22 + `npm ci`, run `desktop:release`, then `actions/upload-artifact` for `release/*.exe`, `release/latest.yml`, `release/*.blockmap`; also attach them to a GitHub Release when the run came from a `v*` tag. Triggers: `push: tags: v*` and `workflow_dispatch` with a version input.
- electron-builder config: pin `artifactName` to `${productName} Setup ${version}.exe` so it matches the rollback URL builder already in `electron/updater.cjs`; set `nsis.differentialPackage: true`; keep `oneClick: false`.
- `electron/updater.cjs`: feed resolution already supports a generic URL via `POS_UPDATE_FEED`; add a fallback to the URL baked into the build config when the env var is absent. Status states stay as-is.
- `docs/windows-desktop.md`: new "Building and publishing a release" section — tag → workflow → upload three files → tills auto-update; plus the SmartScreen note and where signing would slot in.