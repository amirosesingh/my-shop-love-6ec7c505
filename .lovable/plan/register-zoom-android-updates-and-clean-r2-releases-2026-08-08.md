# Register zoom, Android updates, and clean R2 releases

## 1. Register page: no stray scrolling, zoom lives in settings

- Remove the floating zoom control from the register page; the register canvas clips overflow instead of producing a second scrollbar when content already fits.
- Move the zoom control to **Settings → Display & sizing**, next to the existing font scaling controls.
- Default zoom becomes **70%** and is stored with the other display preferences, so it survives reloads, sign-outs, and app restarts instead of resetting each time the register opens.

## 2. Android "Check for update now" fails to fetch

The phone checks the update feed with the browser fetch API, which the Android webview blocks as a cross-origin request — that is the "Failed to fetch".

- Use the native HTTP bridge for the update-feed read and the APK/web-bundle download when running on Android; keep plain fetch on desktop and web.
- Show the real reason on failure (network vs. feed missing vs. HTTP status) rather than a bare "Failed to fetch".
- Point the phone at the stable `latest/android/` pointer, keeping the legacy `android/` path as a fallback so already-installed phones keep working.

## 3. Clean R2 layout — no unwanted folders

Today the desktop workflow uploads the entire build output directory, so `win-unpacked/`, debug files, and other build leftovers land in the bucket alongside the installer.

Target layout under the `updatelccms` bucket:

```text
pos-app/
  latest/                       Windows installer + blockmap + latest.yml + release.json
  latest/android/               APK + latest.json (+ web/ bundle)
  releases/<tag>-<sha>/         immutable copy of the same files
```

- Upload an explicit allowlist of files only: `*.exe`, `*.exe.blockmap`, `latest.yml`, `release.json` for Windows; `*.apk`, `latest.json`, web bundle for Android. Nothing else is copied.
- Drop the duplicated legacy top-level `pos-app/` copy for Windows once `latest/` is in place (the desktop feed already reads `latest/`), and keep the Android legacy path only as the fallback described above.
- Sync with delete on the `latest/` prefixes so removed files (including previously uploaded `win-unpacked/`) are cleared from the bucket on the next release.
- Existing stray folders already in R2 get removed by the first run of the cleaned workflow.

## Technical notes

- Files touched: `src/routes/register.tsx`, `src/components/pos/ZoomCanvas.tsx`, the display/sizing settings route and its preference store, `src/lib/android-updates.ts`, `src/lib/web-bundle-updates.ts`, `.github/workflows/desktop-release.yml`, `.github/workflows/android-apk.yml`.
- Android HTTP uses `CapacitorHttp`; downloads stream to app storage as they do now.
- No database or schema changes.
