# Version 1.2.x and a clean set of release workflows

## Version bump

- `package.json` and `src/version.ts` move from `1.1.16` to `1.2.0`.
  Every push to main keeps bumping the patch digit (1.2.1, 1.2.2, ...), so the
  next builds stay on the 1.2.x line.

## Workflows after the change

```text
ci.yml               PRs + main        tests, lint, typecheck, dependency audit
desktop-release.yml  push main / tag   Windows .exe -> R2 + GitHub release
android-apk.yml      push main / tag   APK + web bundle -> R2 + GitHub release
```

`deploy.yml` is deleted: Cloudflare already pulls from the repo and deploys the
site itself, so a second Worker deploy from Actions is redundant and can race
with Cloudflare's own build.

## Desktop release (Node only)

- Runs on `windows-latest` with Node 24 and `npm ci` / `npm install` — no Bun
  anywhere in this workflow, as requested.
- Bumps the patch version, commits `package.json` + `src/version.ts`, tags
  `v<version>` and pushes it.
- Builds with `npm run desktop:release` (Electron installer + `latest.yml`).
- Uploads with the R2 keys already stored in GitHub
  (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`):
  - immutable copy to `pos-app/releases/<tag>-<shortsha>/`
  - refreshed pointers in `pos-app/latest/` and the legacy `pos-app/` path that
    the tills already poll (`no-cache` headers so electron-updater sees them)
  - `release.json` manifest with version, tag, commit and timestamp
- Attaches the `.exe`, `latest.yml` and blockmap to the GitHub release.
- Skips the R2 step with a clear message when the secrets are missing.

## Android APK

- Stays on Ubuntu with Node + Java 21 + the Android SDK, but installs with
  `npm` too so both release paths use one toolchain.
- Same versioned/latest R2 layout under `pos-app/android/` and
  `pos-app/android/web/`, plus the immutable `releases/<tag>-<sha>/android/`
  copy, and `latest.json` extended with tag and commit.
- Uploads the APK artifact and attaches it to tagged releases.

## Security / CI

- `ci.yml` keeps the permission and route-guard tests, lint, typecheck/build and
  the high-severity dependency audit, and reports failures to the in-app alert
  ingest — switched to npm for consistency with the release jobs.

## Notes

- Update clients need no change: `latest.yml` and `latest.json` keep their
  current URLs; new fields are additive.
- Both release jobs keep `concurrency` groups and least-privilege `permissions`.
