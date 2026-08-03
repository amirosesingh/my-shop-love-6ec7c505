# Make installs work with a lockfile everywhere

## What is actually there

Both package files exist in this project and are tracked in git:

- `package.json` (version 1.0.12 — Capacitor plugins, `mssql`, Electron toolchain all listed)
- `bun.lock` — the lockfile

What is missing is `package-lock.json`. It was deleted in an earlier fix, so a machine
using **npm** has no lockfile at all, while GitHub Actions installs with
`bun install --frozen-lockfile`. That is the mismatch: the docs tell you to run
`npm install`, but the only lockfile in the repo is Bun's.

## Fix: one install tool, everywhere

Standardise on **Bun**, since the Android and desktop workflows already use it and
`bun.lock` is the committed lockfile.

1. **Docs** — `docs/run-locally.md` and `docs/android-apk.md`: replace `npm install`
   with `bun install`, and `npm run ...` with `bun run ...`
   (`bun run dev`, `bun run desktop:build`, `bun run mobile:build`,
   `bun run desktop:package`). Add a one-line Bun install for Windows:

   ```text
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```

2. **Fallback for npm users** — note that `npm install` still works (it resolves
   fresh instead of from a lockfile), and that `package-lock.json` must not be
   committed so the two lockfiles never disagree.

3. **`.gitignore`** — add `package-lock.json`, so a stray npm run cannot introduce a
   second lockfile that breaks the frozen-lockfile CI step.

4. **README** — a single "Getting started" block with the Bun commands, matching CI.

5. **Version** — bump to 1.0.13 in `package.json` and `src/version.ts`.

## Not changed

No dependency versions, no app code, no workflow changes — the CI install step is
already correct.