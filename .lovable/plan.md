# Startup, activation and emergency access: one shared set of rules

## Problem (verified in code)

Registration and connectivity are entangled. `__root.tsx` shows the activation
screen when the backend is "not configured" and no activation blob exists;
`AppShell.tsx` shows activation whenever `terminal.config` is missing and mounts
`CloudSetupGate` (which pushes the cloud-keys dialog) regardless of connectivity;
`TerminalActivation.tsx` polls the cloud activation RPC every 3 seconds and
renders every failure — including plain "no connection" — as "Could not verify
this activation code". There is no stored notion of "verified recently" and no
offline grace window: the only signal is the sealed activation blob read by
`readTerminalConfig()`.

## What changes

### 1. Two independent checks

- `isRegistered()` — reads the local record only, never the network. Returns
  `registered`, `grace-expired`, or `not-registered`.
- `isCloudConnected()` — thin wrapper over the existing connection-health
  heartbeat (`connection-health.ts`). Contains no activation logic.

Everything below consumes only these two.

### 2. Minimal, tamper-evident activation record

Stores only: terminal/device id (existing token id), `activated`, last
successful verification timestamp, offline grace expiry, and the server-issued
verification stamp when the RPC returns one. Nothing else — no keys, no user
rows, no tables.

Sealed in the existing per-device secure store (Electron safeStorage / Android
Keystore / sealed browser store via `device-secrets.ts`), with a device-key HMAC
over the fields so hand-editing local storage invalidates the record instead of
granting access. Written on each successful heartbeat/status check; a confirmed
revocation clears it. Grace window default 7 days, exposed as a setting rather
than a constant.

### 3. Startup flow

Registered:

| cloud | behaviour |
|---|---|
| reachable | straight to Login, no setup screens |
| unreachable, grace valid | Login with a small "offline mode" indicator, no cloud-setup dialog |
| unreachable, grace expired | treated as not registered |

Not registered:

- No database connection configured, or cloud unreachable → "Connect to
  database" screen (project URL + API key). This is the startup screen every
  time that state holds, not a one-time first-run gate.
- Connection succeeds → "Terminal activation" screen for the activation code.
- Database already configured and reachable but terminal not activated → skip
  straight to activation; never re-ask for URL/key.
- On successful activation → Login, and the record from section 2 is written.

The two screens stay separate steps, never merged into one form.

### 4. Emergency Access (separate entry point)

Reachable whenever the normal flow cannot complete, using the same two checks:

| registered | cloud | behaviour |
|---|---|---|
| yes | yes | full online verification as today; on success refresh the record and extend grace |
| yes | no | grace valid → emergency access in offline mode, no cloud dialog, "Verified offline — valid until <date>" |
| no | yes | today's dialog: could not verify activation code, set cloud URL and key |
| no | no / grace expired | no cloud dialog; "Offline emergency mode — limited local functions only", local-only cards stay usable |

The activation card polls only when cloud is reachable; offline it shows a quiet
"waiting for a connection" note instead of a repeating red error.

### 5. Local trading untouched

Register, sign-in, checkout and printing paths are not modified and must not
read the new record.

## Technical notes

- New `src/lib/activation-record.ts` (read/write/HMAC verify/grace maths) on top
  of `device-secrets.ts`, alongside `terminal-tokens.ts`.
- New `src/lib/registration-status.ts` exporting `isRegistered()` and
  `isCloudConnected()`, plus a `useStartupGate()` hook returning
  `{ registered, graceValid, cloudConnected, dbConfigured, step }` where step is
  `connect-db | activate | login`.
- `src/routes/__root.tsx` and `src/components/pos/AppShell.tsx` branch on
  `useStartupGate()`; `CloudSetupGate` no longer mounts when registered or when
  cloud is unreachable.
- New "Connect to database" startup screen reusing the existing
  `CloudConnectionPanel` fields, distinct from the activation screen.
- `use-revocation-check.ts` writes the record on each successful status check
  and clears it on confirmed revocation.
- `RecoveryHub.tsx` / `recovery.tsx` render the four-branch mode banner;
  `TerminalActivation.tsx` gains a `pollEnabled` guard and offline wording.
- Grace days added to the existing settings registry (default 7).
- Tests: grace expiry, tampered-record rejection, each startup branch, each of
  the four emergency branches, and an assertion that the trading path has no
  dependency on the activation record.
- Version bump via `node scripts/bump-version.cjs`.
