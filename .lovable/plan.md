# Emergency codes on screen, and what really protects the backend address

Two things: an owner screen that shows the live emergency code for any till, and the
security model behind the backend address you type into a terminal.

## Part 1 — Emergency code admin screen

Today each till invents its own random emergency secret and seals it in Windows DPAPI /
Android Keystore. Nothing else in the world has a copy, so the only code you can produce
without the machine is the clock-only fallback, whose salt (`northwind-pos-emergency-v1`)
is shipped inside every APK, Electron bundle and browser build. Anyone who unpacks a build
can compute that code for every terminal you own. That is the real problem to fix.

### How it will work

```text
Till (first online moment)
   → wraps its emergency secret, sends it once to the POS server
        → server encrypts it with SETTINGS_ENCRYPTION_KEY and stores the ciphertext
Owner opens Settings → Emergency codes
   → picks the till (by name + 4-character fingerprint already shown on its lock screen)
        → server decrypts, derives the current 6-digit code, returns only the code
   → screen shows the code and the seconds left before it changes
```

The secret itself is never returned to the browser, never stored in plain text, and never
readable through the data API — only the server's own key can unwrap it.

### Screen

New page `Settings → Emergency codes` (`/settings/emergency-codes`), in the same group as
Terminal activation:

- one row per registered terminal: device name, branch, fingerprint, last seen, whether a
  recovery secret has been escrowed yet
- "Show code" reveals a large 6-digit code with a countdown bar; it refreshes itself each
  minute while open, and hides again after two minutes
- every reveal is written to the audit log (who, which terminal, when)
- restricted to owner/manager role, with a manager PIN confirmation before the first reveal

### Removing the shipped master salt

The product-wide fallback salt stops being a build-time constant. Instead, each terminal
receives a per-company recovery salt inside its activation payload and seals it locally,
so the fallback code becomes company-specific and cannot be computed from a downloaded
build. Terminals already activated keep working: the old salt stays accepted for a short
compatibility window and is dropped on their next successful sync, which re-seals the new
one. Nothing about the ±3-minute drift, the 6-digit format or the lockout changes.

## Part 2 — Backend address security

Short answer: the backend address is an address, not a credential, and it is not what
keeps anyone out. Type your own custom domain there — the same one your web app runs on
(for example `https://pos.yourcompany.com`). Guessing it gains an attacker nothing,
because every endpoint behind it already demands a credential the guesser does not have:

- `/api/public/terminal-staff` and the sync endpoints require a registered, unrevoked
  terminal activation token; unknown or revoked tokens get 401 and no data
- `/api/public/cashier-login` requires a username plus PIN and is throttled centrally per
  account and per IP address, so scripted guessing locks out
- every read/write beyond that runs under row-level security, scoped to that terminal's
  branch
- revoking a terminal in Settings → Terminal activation cuts that machine off instantly,
  regardless of what address it points at

So the same address on twenty PCs is fine: each PC is identified by its own token, not by
the URL.

The one gap worth closing is the mirror image of your question — not a stranger reaching
your server, but one of your tills being pointed at somebody else's. This plan adds:

- **Instance fingerprint.** `/api/public/health-metadata` returns a short, non-secret
  fingerprint of the company instance. The activation payload carries the expected value,
  so a till that is re-pointed at a different server refuses to sync and says the address
  belongs to a different company instead of silently talking to a stranger.
- **Address change is an admin act.** Editing the backend address in Recovery already sits
  behind the Emergency PIN gate; the change is recorded in the activation log with the old
  and new value.
- **Visible confirmation.** The Backend address card shows, after a successful test, which
  company instance answered — so you can see at a glance that the till reached your server.

## Technical notes

- New central table `terminal_recovery_secrets` (terminal token id, fingerprint, sealed
  secret, platform, updated_at), RLS on, no `anon`/`authenticated` policies, grants to
  `service_role` only; mirrored into the offline SQL Server schema as a guarded statement
  and into `database/schema.sql`.
- Escrow endpoint: authenticated-by-terminal-token server route that accepts the secret
  once per terminal and stores it encrypted with `SETTINGS_ENCRYPTION_KEY`.
- Reveal path: role-gated server function; returns `{ code, expiresInSeconds }` only.
- Electron gains an IPC call to hand its sealed secret to the escrow (main process reads
  it, renderer never sees it); Android reads it from the Keystore-backed store.
- CLI `scripts/emergency-pin.cjs` stays as a break-glass tool.
- Version bump via `node scripts/bump-version.cjs`; tests for escrow encryption, code
  derivation parity between server and device, and role gating on the reveal.

No business logic, pricing, sync or schema outside the items above is touched.
