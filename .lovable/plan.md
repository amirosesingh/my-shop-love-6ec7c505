# Deleted terminal record should log the till out

Right now, if the terminal's registration row is **revoked** in the database, the PC locks itself on its next five-minute check and asks to be activated again. But if the row is **deleted outright**, the check comes back empty and the app treats that as "no answer yet" — so the till keeps working as if nothing happened. That is the behaviour you saw.

## What changes

The regular check keeps three outcomes instead of two:

- Record present and healthy: carry on (unchanged).
- Record marked disconnected: lock and ask for a new code (unchanged).
- Record gone: treat it as disconnected too — wipe the saved registration and show the same "This terminal is no longer registered" screen.

## Guarding against false alarms

A missing record must never be confused with a bad connection or a database that is briefly unreachable, because that would lock a working shop floor for no reason.

- Only a lookup that genuinely succeeded and returned nothing counts. Any error, timeout or offline moment is ignored exactly as today.
- Two consecutive empty answers, a few seconds apart, are required before the till locks. One stray empty answer is retried, not acted on.
- Offline tills are untouched: with no connection there is no verdict and selling continues.

## What the operator sees

The existing locked screen, with wording that fits both cases: the terminal is no longer registered on this database and needs a fresh activation code from an administrator. The screen offers the activation flow directly, so re-registering is one code away. Background syncing stops while locked, as it already does for disconnected terminals.

## Technical notes

- `src/lib/use-revocation-check.ts`: `fetchTokenStatus` returning `null` (RPC succeeded, no row) becomes a positive "missing" verdict behind a one-retry confirmation, then runs the same `setBlocked(true)` + `clearTerminalConfig()` + `clearActivationRecord()` path as `status === "revoked"`. Thrown errors keep the current do-nothing behaviour.
- `src/platforms/web/components/pos/AppShell.tsx`: `TerminalRevokedScreen` gains a reason (`revoked` vs `missing`) so the message names the right cause; no routing change.
- The desktop copy of the registration on disk is already cleared by `clearTerminalConfig()` through the shell bridge, so a restart will not resurrect it.
- Add tests covering: deleted row locks after confirmation, single empty answer does not lock, lookup error does not lock, offline does not lock.
