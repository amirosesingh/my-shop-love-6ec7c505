# Windows update: fix the failure, keep 5 releases, notify on the till

Three things: find and fix why the Windows update ends in a connection
("SSL protocol") error, stop the update folder growing for ever, and show the
same "new version" prompt on the till that the phone already gets — including
on the login screen.

## 1. The update error

What is confirmed from the code: the till downloads the installer through the
desktop shell's own network layer, and the message shown is a raw browser-level
connection error passed straight through to the card. What is **not** yet
confirmed is why the secure connection to the update server fails — that needs
a reading from the machine itself, so diagnosis is the first step, not a guess.

Work, in order:

1. **Show the real reason.** Today any failure becomes one cryptic line. The
   update card will report which address failed, at which stage (checking,
   downloading, verifying, installing) and the plain-language cause
   ("the update server refused a secure connection", "the download was cut off"
   at 63%, and so on), with a "Copy details" button so a counter can send it.
2. **Add a one-tap connection test** on the update screen: it contacts the
   update folder from the desktop process, reports the server's answer, and
   says whether the secure handshake itself succeeded. This turns the report
   into a fact instead of a theory.
3. **Make the download survive the fault** regardless of its cause:
   - turn off the partial/"delta" download mode, which makes many small ranged
     requests and is the most fragile part of the chain, so the till fetches
     one plain file;
   - retry a failed or interrupted download up to three times with a pause and
     resume where the server allows it;
   - if the built-in downloader still fails, fall back to fetching the
     installer through the shell's own network helper (the one already used for
     the manifest, which is known to work on these machines) and hand that file
     to the installer — the existing signature/checksum check still runs before
     anything is executed.
4. **Never leave the operator stuck.** When every attempt fails, the card
   offers "Download in browser" with the direct installer link, so a till can
   still be updated by hand.

If the connection test comes back showing the server itself is at fault
(certificate or protocol mismatch on the update domain), that is a hosting
setting rather than an app change and I will tell you exactly what to change.

## 2. Keep only the last 5 releases

The release pipeline currently writes an immutable copy of every build and
never removes any, so the folder grows without limit.

- After each successful publish, list the version folders, keep the newest 5
  (always keeping the one currently pointed at as latest), and delete the rest,
  including their installer, blockmap and manifest files.
- The number is one setting, so 3, 4 or 5 is a one-line change later.
- Same treatment for the Android release folder, so the two stay consistent.

## 3. Update notice on the Windows till

The phone shows a bottom strip on every screen, including before sign-in. The
till only has a small icon in the header, which appears after login.

- The same strip appears on the Windows till: "Version X is available" with
  **Update** while downloading, then "Update ready" with **Restart now**, plus
  progress while it downloads and a dismiss button.
- It renders at the app root, so it is visible on the login screen and on the
  activation screen, not only inside the register.
- It never interrupts a sale: dismissing hides it until the next launch or the
  next new version, and installing still only happens on restart.

## Technical notes

- `electron/updater.cjs`: `disableDifferentialDownload = true`, retry wrapper
  around `checkForUpdates`/download, staged error objects (`stage`, `url`,
  `code`), and a `fallbackDownload` path reusing `electron/net.cjs` plus the
  existing `verifyInstaller` before `spawn`. New IPC `update:diagnose`.
- `electron/net.cjs`: add a streamed binary download with progress and a
  handshake probe; update host allow-list unchanged.
- `src/lib/app-updates.ts`: carry `stage`/`detail`/`diagnose` through the hook;
  `AppUpdateSettings.tsx` gains the failure detail block, "Test connection" and
  "Download in browser".
- New `src/platforms/windows/components/DesktopUpdateBanner.tsx` mounted in
  `src/routes/__root.tsx` next to `AndroidUpdateBanner`, guarded by
  `isWindowsShell()`.
- `.github/workflows/desktop-release.yml` and `android-apk.yml`: a prune step
  (`aws s3 ls` + sort + `aws s3 rm --recursive`) keeping `RETAIN=5`.
- Version bump via `scripts/bump-version.cjs` with the change.
