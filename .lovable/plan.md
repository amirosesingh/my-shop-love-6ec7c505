# Clean up and repair the GitHub workflow files

Today there are five workflow files and two of them build the same Windows
installer in different, partly broken ways. This tidies them into four
working ones.

## What is wrong now

- `node.js.yml` and `desktop-release.yml` both build the Windows `.exe` on
  every tag, so two runs race to publish the same release.
- `node.js.yml` attaches the release using `steps.bump.outputs.version`, but
  there is no `bump` step in that job, so the tag name comes out empty and the
  release step fails.
- `node.js.yml` installs with `npm install` (unpinned) while every other
  workflow uses the pinned Bun lockfile, so CI and release can build different
  dependency versions.
- `desktop-release.yml` never uploads to the R2 update folder, so an installer
  built from a tag never reaches the tills' update feed.
- The Android workflow uploads to R2 without checking the R2 secrets exist, so
  a fork or an unconfigured repo fails late with a confusing AWS error.
- No workflow declares a least-privilege `permissions` block by default, and
  the Android job has no concurrency guard on the manual path.

## What the workflows become

```text
ci.yml               pull requests + main   tests, lint, typecheck, audit
deploy.yml           push to main           build + deploy the Cloudflare Worker
desktop-release.yml  tag v* or manual       Windows .exe -> R2 + GitHub release
android-apk.yml      tag v* or manual       APK -> R2 + GitHub release
```

- `node.js.yml` is deleted; its R2 upload and release attachment move into
  `desktop-release.yml`, which becomes the single Windows release path.
- `security.yml` is renamed `ci.yml` and keeps the same checks (permission and
  route-guard tests, lint, typecheck/build, dependency audit) plus the alert
  ingest step. Deploy and release both keep their own test+lint gate so a
  failing check still cannot ship.
- Every workflow gets an explicit `permissions` block, a `concurrency` group,
  and consistent Bun install with `--frozen-lockfile`.
- Release jobs skip the R2 upload with a clear message when the R2 secrets are
  not configured, instead of failing.
- Android release builds run on tags rather than every push to main, so a
  routine code change no longer produces a new APK.

## Technical notes

- Pin actions to the current major versions already in use (`checkout@v4`,
  `setup-bun@v2`, `setup-node@v4`, `setup-java@v4`, `setup-android@v3`,
  `upload-artifact@v4`, `action-gh-release@v2`, `wrangler-action@v3`).
- Windows job keeps Node 22 + `bun install --frozen-lockfile`, then
  `bun run desktop:release`, which already bumps and mirrors `src/version.ts`.
- Release names stay `NorthwindPOS-<version>.apk` / `LovablePOS Setup
  <version>.exe`, and `latest.json` / `latest.yml` keep their current paths in
  the `updatelccms` bucket so existing tills keep updating.
- No application code changes.
