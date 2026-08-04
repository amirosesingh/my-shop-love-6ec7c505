# Fix "This page didn't load" after sign-in

## What is actually happening

Confirmed from the runtime error: `TypeError: Cannot read properties of undefined (reading 'length')` inside `applyCloud` in `src/lib/pos-store.tsx`.

On sign-in the till first paints the last known-good offline snapshot saved on the device. Snapshots written by older versions do not contain the newer `shifts` slice, so `cloud.shifts.length` throws while the store is still mounting. The throw happens above every screen, so the root error boundary paints the generic "This page didn't load" page.

"Try again" cannot help: it re-renders the same tree, reads the same stale snapshot, and crashes again — so the button loops back to the error page. Because the snapshot lives on the device, this reproduces on the website, the Windows app and the Android APK alike.

## The fix

1. **Normalise every snapshot on read** — `src/lib/offline-snapshot.ts` returns a fully-shaped slice: `products`, `members`, `sales`, `shifts`, `promotions`, `stores` default to `[]` (anything that is not an array is discarded) and `settings` defaults to an empty object. A snapshot from any older build is then safe to apply.
2. **Make `applyCloud` defensive** — treat each slice as optional (`cloud.shifts ?? []`, `cloud.settings ?? {}`) so a partial payload can never crash the provider, whichever path it came from.
3. **Guard the boot path** — wrap the snapshot-apply step in `PosProvider` in a try/catch that drops a bad snapshot (`clearSnapshot()`) and continues with a normal cloud load, so a corrupt cache self-heals instead of bricking the terminal.
4. **Make recovery real** — in the root error boundary (`src/routes/__root.tsx`), "Try again" performs a hard reload, and a third action, "Clear local cache and restart", removes the offline snapshot and cached POS state before reloading. The error message is shown in small print so the cause is visible next time.

No database, printing, shift or auth behaviour changes.

## Technical notes

- Files: `src/lib/offline-snapshot.ts`, `src/lib/pos-store.tsx`, `src/routes/__root.tsx`.
- Keys cleared by the recovery button: the offline snapshot (`pos.offline.snapshot.v1`) and local POS state (`pos-state-v2`). Terminal registration, credentials and printer settings live elsewhere and stay untouched.
- Version bump to the next patch so the desktop and APK feeds pick up the fix.