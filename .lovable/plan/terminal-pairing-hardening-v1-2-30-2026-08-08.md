# Terminal pairing hardening + v1.2.30

Closes the security finding where anyone who learns a terminal's token ID can fetch that till's permanent sign-in credentials. Credentials become a one-time payout at claim time, revocation becomes instant, and the database refuses writes from revoked tills even if a device misses the signal.

Note on naming: this project stores tills in `terminal_tokens` (not a `terminals` table), with `status` values `active` / `used` / `revoked`. The work below uses that existing table and adds the missing claim fields rather than introducing a parallel one.

## 1. Version 1.2.30
- `package.json` version and `src/version.ts` `APP_VERSION` both set to `1.2.30`.

## 2. One-time claim, single payout of credentials
- Add to `terminal_tokens`: `claim_secret_hash`, `claim_expires_at`, `credentials_issued_at`, `device_platform`, `device_os`.
- Rework the claim routine so a single transaction checks the token is `active` and not expired, marks it `used` with `claimed_at`/`activated_at`, stores the device metadata, and mints a one-time device proof returned only to that caller.
- Replace `getTerminalAccount` with `claimTerminalToken({ tokenId, deviceProof, device: { platform, os } })`. It releases the machine-account credentials only when the device proof matches and credentials have not been issued before. Every later call with the same token ID is rejected as unauthorized.
- Recovery after a wipe or reinstall goes through re-pairing (admin re-issues), which Settings → Terminal activation already supports.

## 3. Credential persistence across platforms
- Web and Android keep using the existing encrypted device store (AES-GCM over local storage) for the device proof and credentials.
- Electron keeps its on-disk copy in the app's user-data folder, extended to hold the sealed credentials so the Windows app survives restarts and in-place updates without re-pairing.

## 4. Instant revocation
- New `src/lib/terminal-listener.ts` subscribes to row updates for this till's token and calls a shared `triggerImmediateLockdown()` when status turns `revoked` or the row is disabled. The existing five-minute poll stays as the offline-safe fallback.
- `triggerImmediateLockdown()` purges stored credentials and device proof, signs out locally, clears in-memory session state, and shows the existing non-dismissible "authorization revoked" screen. On Electron it also clears the disk copy and tells the shell to lock the window.
- Enable realtime publication for the token table so the update actually reaches clients.

## 5. Database-level guard
- Add an `is_terminal_active()` helper and require it in the access rules for terminal-written tables, so a revoked till's writes are refused by the database itself.
- Any refusal that names a revoked terminal triggers the same lockdown on the client.

## 6. Logging
- Record pairing requests, failed claims, and revocation events (terminal, platform, OS, caller IP, timestamp) into the existing audit log, readable from Settings → Diagnostics.

## Technical notes
- New SQL file `supabase/sql/22_terminal_claim_hardening.sql` (idempotent) carries the column additions, the reworked claim function, grants, realtime publication, and the RLS helper. It runs against your own Supabase project — nothing touches the Lovable-managed database.
- Files touched: `package.json`, `src/version.ts`, `src/lib/terminal-account.functions.ts`, `src/lib/terminal-account.server.ts`, `src/lib/terminal-session.ts`, `src/lib/terminal-tokens.ts`, `src/lib/use-revocation-check.ts`, new `src/lib/terminal-listener.ts`, `src/components/pos/TerminalActivation.tsx`, `electron/terminal-store.cjs`, `electron/main.cjs`, `electron/preload.cjs`.
- Existing activated tills keep working: their token is already `used` and their saved credentials stay valid; only fresh credential requests require a claim proof.