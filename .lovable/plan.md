# Cross-platform Update Center + One UI layout refactor

## What changes for you

- One update system for all three platforms. The till (Windows), the Android app and the browser all read the same self-hosted `manifest.json` on your update server, compare it with the running version and offer the right action: install an APK on Android, restart-to-install on Windows, and a plain "you are up to date" note on the web.
- Update checks can no longer hang. Every request gives up after 7 seconds and shows a clear message instead of a stuck "Checking for updates…".
- A redesigned Settings & Updates page in Samsung One UI style: grouped rounded cards with divided rows, big touch targets on the phone, and a three-pane layout (nav / workspace / system health) on wide desktop screens.
- Android edge-to-edge fixes: the header no longer sits under the status bar or camera cutout, the footer clears the gesture bar, and the layout stops jumping when the browser bar hides.

## Update manifest format

Hosted at `https://updatecms.luckycharmsdnbhd.com/pos-app/manifest.json` (base URL stays configurable via `VITE_UPDATE_BASE_URL`):

```text
{
  "version": "1.2.101",
  "buildNumber": 1201,
  "releaseNotes": "Bug fixes and UI improvements",
  "apkUrl": "https://.../app-updates/NorthwindPOS-1.2.101.apk",
  "bundleUrl": "https://.../app-updates/web-bundle-1.2.101.zip",
  "windowsUrl": "https://.../app-updates/NorthwindPOS-Setup-1.2.101.exe"
}
```

The existing `latest/android/latest.json` and `latest/android/web/latest.json` feeds stay as fallbacks so phones already in the field keep updating.

## Technical work

**1. New `src/lib/update-manifest.ts`**
- `fetchManifest()` — reads `manifest.json` through the existing `httpGetJson` (Capacitor native HTTP on Android, `fetch` elsewhere), wrapped in a `withTimeout(7000)` promise race, `try/catch/finally` so the caller always leaves the checking state.
- `compareVersions()` — reuse the numeric comparison already in `android-updates.ts`, exported once and shared.
- `resolvePlatformTarget()` — picks apk / bundle / windows entry from platform detection in `src/lib/native.ts`.

**2. Rewire the existing updaters onto the shared module**
- `src/lib/android-updates.ts`: manifest-first, legacy `latest.json` feeds as fallback; keeps the download → `Filesystem.writeFile` → `FileOpener.open` PackageInstaller flow; adds the 7s timeout and a `finally` that always clears `checking`.
- `src/lib/web-bundle-updates.ts`: reads `bundleUrl` from the manifest for the OTA web bundle, unchanged download-and-serve-next-launch behaviour.
- `src/lib/app-updates.ts` (Electron bridge): if the native bridge reports `unavailable`, fall back to the manifest so the desktop card still shows a real "new version available" state; install still goes through `electron/updater.cjs`.
- No Play Store / in-app-update API is used anywhere; the manifest checker is the only path.

**3. Global CSS (`src/styles.css`)**
- Safe-area custom properties `--safe-top/--safe-bottom/--safe-left/--safe-right` from `env(safe-area-inset-*)`.
- `@utility` helpers: `pt-safe` (`calc(max(env(safe-area-inset-top),0px) + 0.75rem)`), `pb-safe` (`max(env(safe-area-inset-bottom), 0.75rem)`), and `touch-target` (min 44x44px).
- Custom thin scrollbar styling (WebKit + `scrollbar-width`) using theme tokens, plus smooth hover transitions on interactive rows.
- Z-index scale documented and applied: sticky header `z-30`, backdrop `z-40`, drawer/sheet `z-50`.

**4. `src/routes/__root.tsx`**
- Viewport meta updated to `width=device-width, initial-scale=1, viewport-fit=cover` (required for `env(safe-area-inset-*)` to report non-zero on One UI).

**5. `src/components/pos/AppShell.tsx`**
- Root container switches to `min-h-dvh`; mobile header gets `pt-safe`, mobile footer/status bar `pb-safe`.
- Mobile drawer: `z-50` panel over a `z-40` backdrop, ESC-to-close and focus return; all header buttons sized to the 44px touch target.
- Desktop keeps sidebar → workspace and gains an optional right rail slot for the system-health panel on `xl` and wider.

**6. New Settings & Update Center page (`src/routes/settings.updates.tsx` + `src/components/pos/AppUpdateSettings.tsx` rewrite)**
- One shared component for all platforms, branching only on capability, not on a separate Android copy.
- One UI tile groups: *Version & channel*, *Update status* (progress, release notes, last checked, error), *Actions* (Check now / Download & install / Restart & install), *System health* (existing `SystemHealthCard` moved into the right rail on desktop, into a tile on mobile).
- Cards use `rounded-2xl border divide-y`, `bg-background`/`bg-card` semantic tokens so light/dark follow the existing theme provider automatically.

**7. Housekeeping**
- Version bump, and the `latest.json` writer in `scripts/android-release.cjs` / `scripts/desktop-release.cjs` also emits the new top-level `manifest.json` so releases publish both formats.

## Out of scope

No changes to sales, shift, sync or auth logic — this is presentation plus the update transport only.
