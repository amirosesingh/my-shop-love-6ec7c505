# Fix: phone app stuck on "Starting the till…"

## What is happening

On Android the app waits for the device's durable storage to be copied back into the app before it renders anything. That wait has no time limit and no error path: if the storage plugin doesn't answer (plugin not registered in the APK, or a slow/failed call), the screen stays on "Starting the till…" forever.

The web preview is unaffected — it renders the sign-in screen normally — so this is specific to the packaged phone build.

Note: the exact reason the storage call doesn't answer on your device is not yet confirmed. The fix below makes the app boot regardless, and adds a visible diagnostic so we can see the real cause if anything still misbehaves.

## The fix

1. **Never block the till on storage.** The start-up gate gets a hard 4-second limit. If restoring durable storage hasn't finished by then, the app opens anyway and finishes restoring in the background.
2. **Skip the plugin cleanly when it isn't there.** Check that the Preferences plugin is actually available before calling it, and put a per-call timeout on each read so one hung call can't stall the sequence. If unavailable, the till runs on normal browser storage for that session.
3. **Show what went wrong instead of a dead screen.** The loading screen gains a short status line and, after the timeout, a "Continue anyway" button plus the error text — so a stuck boot is always escapable on the counter.
4. **Docs.** Add a short "phone app won't get past the loading screen" section to the Android guide, including how to view device logs over USB.

## Technical notes

- `src/components/pos/NativeBoot.tsx`: race hydration against a timeout; keep mirroring running after render; render an escape hatch and the caught error.
- `src/lib/mobile-storage.ts`: guard with `Capacitor.isPluginAvailable("Preferences")`, wrap `keys()`/`get()`/`set()` in timeouts, and still install the write-through mirror when hydration partially fails.
- `docs/android-apk.md`: troubleshooting section.
- Patch version bump per project convention.
