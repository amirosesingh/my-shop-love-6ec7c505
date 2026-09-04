# Emergency Access: one code in, everything editable

## What happens today

Two separate locks sit behind the Emergency Access button, which is why you keep being asked to sign in even after the clock code is accepted:

1. **The recovery screen hides most of itself.** `RecoveryHub.tsx` computes `privileged = isSupervisor || isAdmin`. Without a signed-in supervisor it shows only the mode banner, the database/cloud card, branch binding and activation (activation only while the terminal is unactivated). Local database, receipt printer/cash drawer and offline grace period are hidden, with the note "…stay closed until a supervisor or administrator signs in".
2. **The desktop till refuses the saves.** On Windows every bridge call is classified in `electron/ipc-privilege.cjs`. Saving a connection, backend address, cloud keys, terminal identity or config (`pos:connect`, `cloud:set`, `backend:set`, `terminal:write`, `config:set`, `settings:set` for restricted keys, all `sqladmin:*`) needs an administrator unlock. Those channels are open only during genuine first run — no connection and no activation. A till that is already half-configured is not first run, so `PrivilegeGate` pops the "Unlock this terminal — username and PIN" dialog on every save.

## The change

Entering the correct device date/time code becomes the unlock for the whole recovery screen, for a bounded session, on all three platforms.

1. **Recovery screen fully open.** Remove the `privileged` conditionals in `RecoveryHub.tsx` so all cards render and all fields are editable once the code gate has passed. Drop the "stays closed until a supervisor signs in" note.

2. **A recovery session on the desktop till.** `EmergencyPinGate` also tells the desktop process it was unlocked; the desktop process verifies the same `YYYYMMDDHHMM` code against its own clock (±1 minute, reusing the existing rule) rather than trusting the window, then opens a recovery session in `admin-session.cjs` that expires after 15 minutes of inactivity and is cleared when recovery is left.

3. **What the recovery session may do.** While it is open, the repair channels are allowed without a username/PIN: connection and cloud keys, backend address, terminal identity/activation, config and restricted settings, local SQL Server setup and its driver, printer/drawer, connection tests and schema repair. Deliberately left needing a real administrator: clearing the audit log, backup/restore, quitting or rolling back the app. Those aren't repairs and shouldn't be reachable by holding the device.

4. **Web and Android** already have no bridge, so removing the screen-level hiding is enough there.

## Trade-off you should know about

The code is only the device's own clock, so anyone standing at the terminal can read it. Widening the recovery screen means that person can also change the local database, printer and grace period — not just the connection. That is exactly what you asked for and it matches how a physical till is treated, but it does mean physical access to the machine equals connection-level access. The audit trail, backups and app control stay behind a real administrator so the damage is bounded and recorded.

## Technical notes

- Files: `src/platforms/web/components/pos/RecoveryHub.tsx`, `src/platforms/web/components/pos/EmergencyPinGate.tsx`, `electron/ipc-privilege.cjs`, `electron/admin-session.cjs`, `electron/preload.cjs` + `main.cjs` (one new open channel `admin:recovery-unlock`, verified in the main process), `src/lib/emergency-pin.ts` (export the code check for reuse).
- New tests: recovery session grants the repair channels and refuses audit-clear/restore/quit; an expired or wrong code grants nothing; recovery session expires; web/Android path unaffected.
- No change to the code algorithm, cashier/manager PINs, normal sign-in, sync, or any selling screen.
- Version bumped with `node scripts/bump-version.cjs`.
