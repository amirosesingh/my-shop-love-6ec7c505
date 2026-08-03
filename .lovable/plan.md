# Fix the phone build: missing plugins and the wrong output folder

Two separate failures, plus one thing that makes both worse.

## What is actually wrong

1. **The phone-only plugins were never added to the project's package list.** `src/lib/mobile-storage.ts` asks for `@capacitor/preferences`, but nothing installs it, so the bundler stops with "failed to resolve import". Same story for the filesystem, app and file-opener plugins used by the self-updater.
2. **The build wrote its output to a different folder than the workflow looks in.** The build finishes fine, then the step that packages the APK checks `dist/server/index.mjs` and `dist/client`, finds nothing (the output landed in `.output/`), and stops with exit code 1.
3. **This project's copy has drifted from your PC/GitHub copy.** Here, `capacitor.config.ts` still points at the update bucket, there is no `mobile-storage.ts`, no mobile build script and no `MOBILE_BUILD` mode — those files only exist on your side. The fix re-applies the whole offline-Android set here so both copies match.

## The fix

### 1. Phone plugins declared properly

- Add `@capacitor/preferences`, `@capacitor/filesystem`, `@capacitor/app` and `@capacitor-community/file-opener` to the project's dependency list so any machine installing the project gets them.
- Keep them out of the browser and Windows bundles: `mobile-storage.ts` and the updater load the plugins with a runtime import only when the app is actually running inside the Android shell, and fall back to normal browser storage everywhere else.

### 2. One agreed output folder

- The phone build writes to a single fixed location and the workflow reads from that same location — no more guessing between `dist/`, `.output/` and `dist-mobile/`.
- `npm run mobile:build` runs that build end to end and then copies the finished web files into the folder Capacitor packages, so a local build and the GitHub build produce the same APK.
- The workflow's "expected output" check names the same folder, and fails with a readable message if it is empty.

### 3. The offline app pieces re-applied here

- `capacitor.config.ts` drops the remote `server.url` and packages the built app inside the APK.
- `src/lib/mobile-storage.ts` — device storage adapter behind the existing snapshot/outbox/journal code.
- `src/lib/android-updates.ts` plus the update banner and the Android card in Settings, Updates, reading `pos-app/android/latest.json` from your bucket.
- `docs/android-apk.md` updated for the offline build and the local command.

### 4. The chunk-size notice

That "chunks larger than 500 kB" line is a warning, not the failure — the POS is a big app. The warning threshold is raised so it stops looking like an error in the log.

## After the fix, on your PC

```
git pull
npm install
npm run mobile:build
npx cap sync android
cd android && ./gradlew assembleDebug
```

## Technical notes

- `vite.config.ts`: `MOBILE_BUILD=1` selects the node-server nitro preset with explicit `output.dir`/`serverDir`/`publicDir` under `dist-mobile/`, plus `tanstackStart.spa.enabled` so the device router serves every route; `build.chunkSizeWarningLimit` raised.
- `scripts/mobile-build.cjs`: runs the mobile vite build, verifies `dist-mobile/public/index.html` exists, syncs it into `capacitor-shell/`.
- Native plugin access goes through `await import(...)` guarded by `Capacitor.isNativePlatform()`, so web/Electron bundles never resolve them at build time.
- `.github/workflows/android-apk.yml`: replace the `dist/server/index.mjs` expectation with `npm run mobile:build` followed by a check on `capacitor-shell/index.html`; keep the R2 upload of the APK and `latest.json`.
