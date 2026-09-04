# Stage 2 continued: terminal lifecycle, desktop bridge, emergency access

Next slice of the production-hardening work. No new subsystems — the existing
activation, desktop bridge and recovery code is reviewed and tightened in place.

## 1. Activation, revocation and replacement

Confirmed already present: expiry check, one-time atomic claim through
`terminal_token_claim`, revoked/used rejection, replacement that retires the old
row, and an activation attempt log.

Work to do:

- Move the trust decisions server-side. The claim RPC must itself refuse an
  expired, revoked or already-claimed token, so a till that skips the pre-checks
  cannot register. The client checks stay as the friendly message.
- Bind the claim to the device: the claim records a device fingerprint, and a
  later status check for a different device on the same token is refused rather
  than silently accepted.
- Reject a wrong-branch pairing: if the token's branch no longer exists or is
  inactive, activation fails with a clear reason instead of registering.
- Revoked-credential reuse: a revoked token id presented again must be refused
  by the relay and sync paths, not only by the five-minute renderer check.
- Offline grace: confirm the grace window ends access rather than extending
  indefinitely, and that a confirmed revocation clears the record even if the
  app is closed at the time (checked on next start).

## 2. Desktop bridge and secure storage

- Every privileged channel gets a declared argument shape through the existing
  `ipc-guard` helpers; channels currently passing objects straight through
  (connect, write, write-batch, restore/compare/housekeep options) are the gap.
- `electron/terminal-store.cjs`: when the OS vault is unavailable the activation
  is written in clear text with no signal. Change to a single explicit state —
  sealed when available, otherwise refuse to persist and tell the operator —
  and verify the plain file is removed after a migration.
- Confirm no terminal secret or database password is readable from the window;
  the bridge should return status, never the stored credential.

## 3. Emergency access (kept, hardened)

- Scope: the recovery screen stays local-only and never gains trading powers.
- Attempt limiting and a cool-off on the code entry, with each attempt written
  to the local audit trail and pushed on reconnect.

## 4. Tests

New Vitest cases: expired token, revoked token online and offline, second device
claiming the same token, wrong/inactive branch, corrupt or missing stored
activation, plaintext-vault refusal, bridge argument rejection per guarded
channel, emergency access success, failure and lockout.

## Technical notes

- Database side: one migration adding the server-side guards to
  `terminal_token_claim` / `terminal_token_status` plus device binding columns,
  with grants and RLS in the same migration; `database/schema.sql` updated to
  match so the schema manager stays the single source.
- Files expected to change: `src/core/activation/terminal-tokens.ts`,
  `activation-record.ts`, `registration-status.ts`, `use-revocation-check.ts`,
  `electron/terminal-store.cjs`, `electron/preload.cjs` and the main-process
  channel handlers, `electron/ipc-guard.cjs`, the recovery route, plus tests.
- Version bump with `node scripts/bump-version.cjs`.
- Verdict stays NOT PRODUCTION READY after this stage; the matrix and go-live
  checklist come in the following stage, and hardware checks cannot run here.
