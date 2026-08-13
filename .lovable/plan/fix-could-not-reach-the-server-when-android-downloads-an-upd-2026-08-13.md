# Fix "could not reach the server" when Android downloads an update

## What is actually wrong

The phone reaches the server fine. The link the update feed hands it is dead.

Verified live against your bucket just now:

```text
pos-app/manifest.json                             200  (apkUrl = .../latest/android/NorthwindPOS-1.2.104.apk)
pos-app/latest/android/NorthwindPOS-1.2.104.apk   404  <-- the phone downloads this
pos-app/android/NorthwindPOS-1.2.104.apk          200  (the APK does exist here)
pos-app/releases/v1.2.104-760efae/android/…apk    200
pos-app/latest/manifest.json                      404
pos-app/latest/latest.yml                         200  (Windows files are intact)
```

Cause: the Windows release workflow uploads to `pos-app/latest/` with `--delete`.
Its upload folder contains only the Windows installer files, so every run wipes
whatever the Android workflow put under `pos-app/latest/android/`. Windows ran
last, so the Android folder is gone while the manifest still points at it. The
download fails and the app reports it as a network problem.

## Fix

1. **Stop the Windows release from deleting Android files** —
   `.github/workflows/desktop-release.yml`: the `latest/` sync keeps `--delete`
   but excludes `android/*` and `manifest.json`, so each platform prunes only
   its own files.

2. **Make the phone survive a bad link** — `src/lib/android-updates.ts`: if the
   APK URL from the manifest is missing (404/410), fall back to the legacy
   `pos-app/android/<file>` path, which is live today, before giving up. Same
   fallback for the web-bundle download.

3. **Honest error text** — `src/lib/native-http.ts`: a failing HTTP status
   reports "The update file is missing on the server (HTTP 404)" instead of the
   generic connection message, so a missing file is never mistaken for a dead
   network.

4. **Republish so the current release is whole** — re-running the Android
   release workflow restores `latest/android/` and `latest/manifest.json`. With
   fix 1 in place, the next Windows release no longer removes them.

## Technical notes

- Files: `.github/workflows/desktop-release.yml`, `src/lib/android-updates.ts`,
  `src/lib/native-http.ts`, `src/lib/web-bundle-updates.ts`.
- The fallback probes with a HEAD request through the native HTTP bridge: one
  small request, only when the primary URL fails.
- No database, schema or POS behaviour changes.