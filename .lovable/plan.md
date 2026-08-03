# Fix the GitHub build: "Dependencies lock file is not found"

## Cause

Two of the four workflows still install with npm, but this repo's lockfile is
`bun.lock` — there is no `package-lock.json`:

- `.github/workflows/node.js.yml` (the R2 build/deploy) — `actions/setup-node` with
  `cache: 'npm'`, then `npm install`. The cache step is what fails: it scans for
  `package-lock.json` / `npm-shrinkwrap.json` / `yarn.lock`, finds none, and aborts
  the job with the exact message you saw.
- `.github/workflows/desktop-release.yml` — `npm ci`, which cannot run at all
  without `package-lock.json`.

The other two (`android-apk.yml`, `security.yml`) already use
`bun install --frozen-lockfile` and work.

## Fix

Make all four workflows install the same way as the working ones.

1. **`node.js.yml`** — add `oven-sh/setup-bun@v2`, drop `cache: 'npm'` from
   `setup-node` (Node still needed for `scripts/bump-version.cjs` and Electron
   packaging), replace `npm install` with `bun install --frozen-lockfile`, and
   `npm run desktop:release` with `bun run desktop:release`.

2. **`desktop-release.yml`** — same treatment: add the Bun setup step, replace
   `npm ci` with `bun install --frozen-lockfile` and `npm run desktop:release`
   with `bun run desktop:release`.

3. **`.gitignore`** — add `package-lock.json` so a stray local `npm install` can
   never commit a second lockfile that disagrees with `bun.lock`.

4. **Docs** — `docs/run-locally.md` and `docs/android-apk.md`: switch the
   `npm install` / `npm run ...` instructions to `bun install` / `bun run ...`, with
   the Windows one-liner for installing Bun:

   ```text
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```

5. **Version** — bump to 1.0.13 in `package.json` and `src/version.ts`.

## Alternative, if you'd rather keep npm

Commit a `package-lock.json` (run `npm install` once locally) and delete `bun.lock`.
I don't recommend it: the Android APK workflow is built around Bun, and two
lockfiles drifting apart is what caused this in the first place.

## Not changed

No dependency versions and no app code — only workflow install steps, gitignore,
docs, and the version number.