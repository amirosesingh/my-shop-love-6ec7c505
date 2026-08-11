# Bump version to 1.2.92 and tag release

## Goal

Increase the project version from `1.2.91` to `1.2.92` and create a matching Git tag so the desktop release workflow publishes the new Windows installer.

## Steps

1. Update `package.json` version field from `1.2.91` to `1.2.92`.
2. Update `src/version.ts` `APP_VERSION` from `"1.2.91"` to `"1.2.92"`.
3. Commit both files with a release message (e.g., `chore(release): 1.2.92`).
4. Create and push a git tag `v1.2.92` pointing to the release commit.

## Outcome

- The in-app version, the installer metadata, and the update feed will all report `1.2.92`.
- The `v1.2.92` tag will trigger `.github/workflows/desktop-release.yml` to build the Windows installer and publish it to the update feed and GitHub releases.

## Notes

- No application code changes.
- The existing `scripts/bump-version.cjs` can be reused to bump the patch digit and regenerate `src/version.ts`, but the final commit will be made directly so the tag is created cleanly.
- The `[skip ci]` marker is intentionally omitted on this commit because the tag is meant to trigger the release workflow.
