# Terminal client: dynamic tenant activation, silent boot, secure vault

Today a till still needs the Supabase URL/key in its own environment: `supabaseConfig()` reads only build/runtime env vars, and an unconfigured terminal shows the "Supabase is not configured" error page instead of an activation screen. The activation token already carries `supabaseUrl` / `supabaseAnonKey` (`ENC_V1:`), but those values are saved and never used to point the client. This plan closes that loop.

## 1. Tenant credentials drive the client

- The connection resolver gains a "terminal override" slot. Resolution order becomes: saved terminal activation (tenant URL + anon key) → values injected by the server into the page → environment variables. The override is installed while unsealing the saved activation and again right after a successful claim.
- A reset path rebuilds the shared Supabase client against the new tenant the moment activation completes or is reset — no app restart.
- On desktop/mobile shells a missing configuration is no longer a hard error: no config plus a terminal shell means "unprovisioned", which routes to the Activation screen. Plain browsers keep the current hard error.

## 2. Silent startup

- Boot order on Windows and mobile: read the OS vault → if credentials exist, install the tenant override, build the client, verify token status in the background, and render the register directly. The existing brief spinner stays; no database prompt, no activation form.
- If the background check reports the terminal was revoked, the existing revoked screen takes over. A network failure never sends a provisioned till back to activation.
- If no credentials exist: Activation screen only.

## 3. Activation screen rework

Two tabs:

- **Scan QR** — existing camera scanner, accepts the `ENC_V1:` string.
- **Enter token** — one field for the "one big token" plus a paste button.

Flow for both: decrypt in memory → reject if the token is older than 15 minutes ("Token Expired") → build a **temporary** Supabase client from the decrypted tenant URL and key (not the global one) → run the one-time claim against that database → on atomic failure show "This activation token has already been used or expired." → on success persist to the vault, swap the global client, and enter the register.

The existing phone-assisted pairing QR block moves into a collapsed "Pair from the phone app" section so it no longer competes with the two tabs.

## 4. OS secure vault

- **Windows:** the desktop shell's activation store switches to Electron `safeStorage` (Windows DPAPI) — encrypted on write, decrypted on read, with a one-time migration of any existing plain `terminal-config.json`. If encryption is unavailable, it falls back to the current file and says so in diagnostics.
- **Mobile:** keeps the existing AES-256-GCM device seal mirrored into Capacitor Preferences. Moving to a native Keychain/Keystore plugin needs a new Capacitor plugin and a fresh native build — flagged as an optional follow-up rather than done here.
- Stored record: tenant URL, tenant anon key, terminal session token, terminal id, location id/name, activation time.

## 5. Unpair / reset terminal

- New card on **Settings → System** (terminal shells only): "Unpair / Reset Terminal", gated by the existing manager PIN prompt, with a confirm step listing what is lost.
- On confirm: purge the vault (sealed copy, browser storage, desktop file), clear the cached tenant override and Supabase client, sign the terminal machine account out, and return to the Activation screen.

## Technical notes

- Files: `src/lib/external-supabase-config.ts`, `src/integrations/supabase/external-client.ts`, `src/lib/terminal-tokens.ts`, `src/lib/use-revocation-check.ts`, `src/components/pos/TerminalActivation.tsx`, `src/components/pos/AppShell.tsx`, `src/routes/settings.system.tsx`, `electron/terminal-store.cjs`, `electron/main.cjs`.
- No database migration is needed: `supabase/schema26.sql` already provides the atomic single-use claim with expiry. The client only has to surface its refusal correctly.
- The claim during activation must bypass the global client, otherwise a fresh till with no environment values would fail before it can learn the tenant address.