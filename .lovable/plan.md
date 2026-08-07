# Versioned R2 release paths + stable "latest" pointers

Today both release workflows upload straight into flat R2 folders, so every build
overwrites the previous one and there is no way to roll back to a known-good
installer. This adds immutable, versioned upload paths plus a single stable
"latest" location per artifact type that the tills keep polling.

## R2 layout after the change

```text
updatelccms/pos-app/
  releases/<tag>-<shortsha>/            immutable, never overwritten
    NorthwindPOS-Setup-<ver>.exe
    *.blockmap
    latest.yml
    android/NorthwindPOS-<ver>.apk
    android/web-<ver>.zip
  latest/                               stable pointers the clients poll
    NorthwindPOS-Setup.exe
    latest.yml
    release.json                        {version, tag, commit, released, paths}
    android/NorthwindPOS-latest.apk
    android/latest.json
    android/web/web-latest.zip
    android/web/latest.json
```

Existing paths (`pos-app/latest.yml`, `pos-app/android/latest.json`) stay
published so already-deployed tills and phones do not break; the new `latest/`
folder mirrors them.

## Desktop workflow (`desktop-release.yml`)

- Compute a release id: `${{ github.ref_name }}-${GITHUB_SHA:0:7}` (falls back to
  `v<pkg version>-<shortsha>` for manual runs).
- Upload the built `release/` folder to
  `s3://updatelccms/pos-app/releases/<release-id>/` with a long cache header
  (`--cache-control "public,max-age=31536000,immutable"`).
- Copy the same files to `s3://updatelccms/pos-app/latest/` and to the legacy
  `s3://updatelccms/pos-app/` path with `--cache-control "no-cache"` so
  electron-updater always sees the newest `latest.yml`.
- Write and upload `release.json` (version, tag, commit sha, UTC timestamp,
  versioned folder URL) to the `latest/` folder.

## Android workflow (`android-apk.yml`)

- Same release id.
- Upload APK + web bundle to `releases/<release-id>/android/` (immutable).
- Publish pointers to `latest/android/` and `latest/android/web/`:
  `NorthwindPOS-latest.apk`, `web-latest.zip`, and `latest.json` extended with
  `tag`, `commit`, and the versioned URL, with `no-cache` headers.
- Keep the current `pos-app/android/` upload for backwards compatibility.

## Notes

- No app code changes needed: the OTA/updater clients keep reading the same
  `latest.json` / `latest.yml` URLs; the extra fields are additive.
- Both workflows keep the existing "skip when R2 credentials are missing" guard.
