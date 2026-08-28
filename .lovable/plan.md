# Secure device pairing, key removal, and auto-filled terminal settings

Background sync, database health and the cloud status icon are left untouched.

## What the audit found

**Keys in the shipped app**

- `src/lib/external-supabase-config.ts` hardcodes one tenant: a Supabase URL and an `sb_publishable_…` key as the built-in fallback project. Publishable/anon only — allowed to stay for the first pairing call, but today it is also the silent fallback for everything else.
- `.env` / `.env.example` hold `POS_SUPABASE_SERVICE_ROLE_KEY` for the server side only; no service key literal is committed anywhere (three tests already enforce that).
- **Real problem:** `Settings → System → Central database key (this PC)` (`ServerKeysPanel.tsx` + `electron/server-keys.cjs`) invites an admin to paste the **service role key** into every till. It is sealed with Windows DPAPI, but a service key on a shop-floor PC bypasses all row rules.
- **Second problem:** each till fetches a machine-account **email + password** (`terminal-account.server.ts`) and stores it via `device-secrets.ts`, which encrypts with an AES key kept in plain `localStorage` — i.e. reversible by anyone with the device. That is a long-lived credential, not a scoped session token.

**Pairing today**

- Terminal shows a `POSPAIR1:` QR carrying only `{tokenId, deviceName}` — correct, no secrets. The pairing id is kept in plain `localStorage` and never expires.
- Admin approval issues an `ENC_V1:` code containing `{supabaseUrl, anonKey, pairToken, ts}` with a **15-minute** TTL, single-use via `terminal_token_claim`.
- After the claim the till gets `tokenId`, `locationId`, `locationName`, `deviceName`, `activatedAt` — **no `company_name`**, and no session token of its own.

**Storage**

- Electron: `terminal-store.cjs` uses `safeStorage`, but silently falls back to a plain `terminal-config.json`; `writeTerminalConfig()` also falls back to plain `localStorage`.
- Android: the activation goes through `device-secrets.ts` (localStorage AES), **not** the Keystore. Only the cloud URL/key use `capacitor-secure-storage-plugin`.

**Settings**

- `CloudConnectionPanel` is manual free-text URL + key entry; `ServerKeysPanel` is manual service-key entry. There is no read-only panel showing company / branch / terminal / pairing date / masked token.

**No-bypass gate** already exists (`__root.tsx` and `AppShell.tsx` render `TerminalActivation` when there is no config) — it just leans on weak storage.

## What will change

### 1. Kill the service-key path on devices

- Delete `ServerKeysPanel.tsx` and its route slot, and remove service-key set/read from `electron/server-keys.cjs` and the preload bridge. The signing key stays (locally generated, not a Supabase secret).
- The till's local server stops needing a service key: cashier PIN checks go through the existing authenticated relay using the terminal's own session token; offline PIN verification against the local database is unchanged.
- Tighten `secrets.security.test.ts` with a rule that fails the build if any client/Electron file reads a `*SERVICE_ROLE*` variable.

### 2. Pairing token: shorter, single-use, no manual entry

- Pairing TTL drops from 15 minutes to **3 minutes** (`ACTIVATION_TTL_MS`), enforced both in the payload `ts` check and server-side in `terminal_token_claim` (migration updates `expires_at` default).
- Pairing screen becomes just the QR plus one instruction line — the logo block, the "paste code" textarea and the camera-scan tab are removed. Expiry shows a countdown and a "Show a new code" button that mints a fresh token id.
- The pairing-request id moves out of plain `localStorage` into the secure device store, and is discarded on expiry.

### 3. Pairing response carries the full identity

The claim RPC returns, and the terminal stores: `company_name`, `branch_id`, `branch_name`, `terminal_id`, `device_name`, `paired_at`, plus a scoped session token. Admin approval keeps its branch picker and auto-selects when only one branch exists. Re-pairing to another branch reuses the same flow and overwrites the branch fields without a logout or data reset.

### 4. Session token instead of a stored password

- The machine account email/password stops being stored on the device. On pairing the backend returns a scoped JWT + refresh handle; `terminal-session.ts` refreshes silently in the background.
- Refresh failure returns the app to the pairing screen — never a connected-looking UI. Already-paired tills keep trading offline against the local database and resync on reconnect; only pairing itself can't be skipped.
- A one-time migration clears the old `terminal-account` secret from devices.

### 5. Storage hardening

- Android: activation + session token move to `capacitor-secure-storage-plugin` (EncryptedSharedPreferences / Keystore), reusing the wrapper pattern already in `secure-cloud-config.ts`.
- Electron: `terminal-store.cjs` drops the plain-JSON write path; if `safeStorage` is unavailable the till reports "secure storage unavailable" and stays unpaired.
- `writeTerminalConfig()` loses its plain-`localStorage` fallback.

### 6. Settings — read-only terminal card

New "This terminal" panel (replacing the manual credential panels for paired devices) showing, all non-editable: Company name, Branch ID, Branch name, Terminal/device ID, Paired on, Last sync, connection status via the existing cloud icon, and the session token **masked to the last 4 characters** (never copyable, never revealed). No API/service key field exists anywhere. Changing branch is a "Re-pair this terminal" button, not a text edit. `CloudConnectionPanel` stays only as a recovery path for a device that has never paired.

## Technical notes

- Files touched: `src/lib/terminal-tokens.ts`, `terminal-crypto.ts`, `terminal-session.ts`, `terminal-account.*`, `device-secrets.ts`, `secure-cloud-config.ts`, `src/components/pos/TerminalActivation.tsx`, `TerminalTokens.tsx`, `UnpairTerminal.tsx`, `src/routes/settings.system.tsx`, `src/components/pos/settings/panels/` (delete `ServerKeysPanel`, add `TerminalIdentityPanel`), `electron/server-keys.cjs`, `electron/terminal-store.cjs`, `electron/preload.cjs`, plus a Supabase migration for the shorter TTL and the company/branch fields on the claim RPC.
- Existing paired tills keep working: the old config shape is read once, upgraded in place, and re-provisioned to a session token on the next successful connection.
- Risk to flag: removing the service key means any till path that today relies on it (bundled-server cashier login) must go through the relay. That path is verified before the panel is deleted, in the same change.
