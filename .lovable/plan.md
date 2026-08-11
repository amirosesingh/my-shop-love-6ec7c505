# Remove the auto-release bump step from desktop-release.yml

## What to change

Delete the entire `Bump patch version` job step from `.github/workflows/desktop-release.yml`. This step currently:

- Runs `node scripts/bump-version.cjs` to increment the patch number.
- Commits the changed `package.json` and `src/version.ts` with the message `chore: release v$version [skip ci]`.
- Tags `v$version` and pushes both the commit and the tag back to `origin`.

Removing it stops the automated patch bump and the associated `chore: release` commit.

## Consequences

- The workflow will build whatever version is already in `package.json` / `src/version.ts` at the time it runs.
- If new releases still need a version bump, it must be triggered manually or by another workflow before the release job runs.
- The remaining `Resolve release identity`, build, R2 upload, and GitHub release-attachment steps stay unchanged.

## Verification

After the edit, read the file to confirm the `Bump patch version` step is gone and the YAML still has valid step ordering and indentation.
