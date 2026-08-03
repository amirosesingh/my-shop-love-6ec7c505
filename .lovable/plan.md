# Clarify and verify desktop update availability

## Confirmed cause

The current page is running in the browser preview. The update hook only enables controls when Electron exposes its secure `window.pos` update bridge, so the browser correctly shows **“Automatic updates are not available in this build.”** A web page cannot replace an installed Windows application.

The Windows update path is already wired to the Electron IPC bridge and the configured update feed. Update checks are intentionally rejected for unpackaged development runs as well; they run only from an installed Windows build.

## Changes

1. Replace the generic unavailable status with an explicit environment label:
   - Browser preview: “Desktop updates are available in the installed Windows app.”
   - Electron development/unpacked run: “Update checks require an installed release build.”
   - Packaged build missing its updater/feed: show the actual updater error.
2. Keep the manual **Check for updates now** control enabled only when the Electron bridge is present, while surfacing the precise reason when it cannot run.
3. Add an Electron packaging/update smoke test covering the preload bridge, packaged-build gate, baked feed URL, and required release artifacts (`latest.yml`, installer, blockmap).

## Validation

- Verify the web preview clearly identifies itself as browser-only without implying a broken build.
- Verify an Electron development run reports that installation is required.
- Verify an installed Windows release can manually check the configured feed and reports either current, downloading, ready, or a specific network/feed error.