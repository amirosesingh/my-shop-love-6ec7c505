# Why the till is still active — comparison first, then the fixes

## What I compared

I checked every place the three shells differ: the browser app, the Android
phone app, and the Windows till. The result is that the till is **not** missing
the feature — it is missing the **software**.

### 1. The "terminal removed" logout is written, but no till has it yet

The check that logs a till out when its record is deleted runs from the one
shared app frame every screen sits inside, and the Windows till loads exactly
the same app files as the browser — there is no separate, lighter desktop
version that skips it. The server routine it asks is readable by an unsigned-in
machine, so it works even with nobody logged in, and a deleted record correctly
comes back as "gone".

The catch: the Windows till only ever receives new app code **inside a new
installer**. The phone can pull new app code on its own (that is why the phone
behaves correctly); the till cannot. The change was finished after the last
installer was produced, and the installer pipeline itself was the thing that
was failing — so every till in the field is still running older software that
has no idea it should log itself out. That is why it keeps working, before and
after a restart, signed in or not.

### 2. A second, real desktop-only bug found while comparing

When the check does fire, the till tries to erase its saved activation from the
computer's secure store. That erase is filed under "administrator only", so on
a counter where a cashier (or nobody) is signed in, the erase is refused. The
screen locks, but the machine keeps its activation on disk — and a wipe of the
browser storage would bring it back. This must be fixed in the same release,
otherwise the logout is only half-done on the till.

### 3. Other differences between the three (not faults, but worth knowing)

| Capability | Browser | Phone | Windows till |
| --- | --- | --- | --- |
| Sells offline against a local database | no | no | yes |
| Prints to attached hardware / opens drawer | no | no | yes |
| Camera barcode scanning | yes | yes | **no** |
| Staff PIN sign-in, activation, emergency access | no | yes | yes |
| Gets new app code without reinstalling | yes | yes | **no** |

The two marked items are genuine gaps on the till.

## What I propose to do

### A. Get the fix onto the tills

1. Correct the erase permission so a revoked or deleted terminal clears its
   saved activation regardless of who is signed in — the machine's own
   housekeeping, not an administrator action.
2. Make the check also run once at start-up, before the sales screen appears,
   so a till that was switched off during the deletion locks on the next
   power-on instead of up to five minutes later.
3. Produce a new installer and confirm the tills pick it up, using the update
   repairs already made (real failure reasons, connection test, browser
   download fallback).

### B. Prove it on the machine, not just in the code

Add a small "Terminal status" line on the Software updates screen showing: the
version this machine is running, when it last checked its registration, and
what the answer was (active / revoked / removed / could not reach). If a till
ever behaves like this again, that line says immediately whether it is old
software or a failed check.

### C. Close the two parity gaps

4. Camera scanning on Windows tills that have a webcam, matching the phone.
5. A short written comparison of the three shells kept with the other
   documentation, so future work does not silently land on one platform only.

Items 1–3 are the actual fix. Item B is one screen. Item C can wait for a
following release if you prefer.

## Technical notes

- `electron/ipc-privilege.cjs`: `terminal:write` moves off `ADMIN` for the
  clearing case — either a dedicated `terminal:clear` channel at `OPEN`, or an
  exception when the payload is `null`. Everything else about that channel
  stays as it is.
- `src/lib/use-revocation-check.ts`: run `terminalVerdict` once during the
  start-up gate in `AppShell` before children render; keep the existing
  five-minute interval and the "no connection, no verdict" rule untouched.
- New status tile fed by `useRevocationCheck` (`lastCheckedAt`, `reason`,
  `online`) plus `APP_VERSION`, rendered inside `settings.updates`.
- Camera scanning: `cameraScanner` flag for `windows` in
  `src/platform-config/features.ts`, with a `getUserMedia` path in `ScanBar`
  (the current one is Capacitor-only).
- Release: version bump via `scripts/bump-version.cjs`, tag, and the desktop
  workflow that now keeps only the five most recent builds.
- No database or schema change; the server routine already answers correctly.
