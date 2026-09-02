# Emergency Access: split "registered" from "cloud reachable"

## Problem (verified in code)

Opening Emergency Access renders the Recovery Hub. Its "Terminal activation" card
auto-opens when the device is not activated and starts a 3-second polling loop
(`TerminalActivation.tsx`) that calls the cloud activation RPC. Every failure —
including a plain "no connection" — is surfaced as an activation error such as
"Could not verify this activation code…" / "Cannot reach the server to verify this
code", which is what appears offline. The hub's "Activated" chip is derived only
from the stored activation blob; there is no notion of a verified-recently record
or an offline grace period, and no branch on cloud reachability.

## What changes

### 1. A minimal, tamper-evident activation record

New module holding only:

- terminal/device id (the existing token id)
- activated: true/false
- last successful verification timestamp
- offline grace expiry (default 7 days after last successful verification,
  configurable)
- the server-issued verification token/stamp when the RPC returns one

Stored sealed in the existing per-device secure store (Electron safeStorage /
Android Keystore / sealed browser store), with a device-key HMAC over the fields
so hand-editing local storage invalidates the record rather than granting access.
Nothing else is cached — no API keys, no user or customer rows, no tables.

### 2. Two independent checks

- `isRegistered()` — reads the minimal record (plus the existing sealed
  activation) and reports registered / registered-but-grace-expired / not
  registered. Never touches the network.
- `isCloudConnected()` — uses the existing connection-health heartbeat; no
  activation logic inside it.

### 3. Emergency Access branching

| registered | cloud | behaviour |
|---|---|---|
| yes | yes | full online verification as today; on success refresh the minimal record and extend the grace window |
| yes | no | grace still valid → grant emergency access in offline mode, no cloud-setup dialog, hub shows "Verified offline — valid until <date>". Grace expired → falls to the row below |
| no | yes | keep today's dialog: could not verify activation code, set cloud URL and key |
| no | no (or expired) | no cloud dialog; show "Offline emergency mode — limited local functions only" and keep the local-only cards usable |

The activation card's pairing poll only runs when cloud is reachable; offline it
shows a quiet "waiting for a connection" note instead of a red error.

### 4. Local trading untouched

The register, sign-in, checkout and printing paths are not modified and must not
read the new record. A short test asserts the trading path has no dependency on
it, alongside tests for grace expiry, tampered record rejection, and each of the
four branches.

## Technical notes

- New `src/lib/activation-record.ts` (record read/write/verify + grace maths),
  built on `secure-settings`/device-secret helpers already used by
  `terminal-tokens.ts`.
- `use-revocation-check.ts` writes the record on each successful heartbeat/status
  check; a confirmed revocation clears it.
- `RecoveryHub.tsx` + `recovery.tsx` consume a new `useEmergencyAccess()` hook
  returning `{ registered, graceValid, cloudConnected, mode }` and render the
  mode banner; `TerminalActivation.tsx` gains a `pollEnabled` guard and offline
  wording.
- Grace days exposed as a settings value (default 7) in the existing settings
  registry so it can be tuned per deployment.
- Version bump via `node scripts/bump-version.cjs`.
