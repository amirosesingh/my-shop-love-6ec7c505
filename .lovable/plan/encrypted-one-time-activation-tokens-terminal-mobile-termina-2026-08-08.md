# Encrypted one-time activation tokens (Terminal + Mobile Terminals)

Upgrade the activation code both admin pages issue: an encrypted, self-contained payload that carries the database address, expires in 15 minutes, and can be redeemed exactly once.

## 1. New token format

Activation codes become a single string:

```text
ENC_V1:<iv-base64>:<ciphertext-base64>
```

The encrypted JSON inside is:

```text
{ supabaseUrl, supabaseAnonKey, pairToken, ts }
```

`pairToken` is the one-time claim id (the token row id), `ts` the issue time used for the 15-minute check. Encryption stays AES-GCM through the browser's built-in Web Crypto, in `src/lib/terminal-crypto.ts`, which gains `encryptActivationV1` / `decryptActivationV1`. The existing decoder is kept as a fallback so tills holding an older code still activate.

## 2. Database rules (script for your own database)

New file `supabase/schema26.sql` to run once on your POS database:

- `terminal_tokens` gains `is_claimed boolean not null default false` and `expires_at timestamptz`.
- Issuing sets `expires_at = now() + interval '15 minutes'`.
- `terminal_token_claim` is rewritten to succeed only when `status = 'active' AND is_claimed = false AND expires_at > now()`, and in the same atomic update sets `is_claimed = true`, `status = 'used'`, `claimed_at`, `claimed_by_device`. Any later attempt returns false.
- `terminal_token_status` also returns `is_claimed` and `expires_at` so the till can explain *why* a code was refused (expired vs already used vs revoked).
- Realtime is enabled for `terminal_tokens` so the admin screen sees the claim instantly.

## 3. Admin UI (both pages)

`src/components/pos/TerminalTokens.tsx` serves `/settings/terminals` (PC) and `/settings/mobile-terminals`; both get the same treatment:

- The QR renders the exact `ENC_V1:...` string (existing `qrcode-generator` already draws whatever string it is given — no new QR dependency needed).
- Below it, one read-only box with the same full string and a **Copy Encrypted Token** button.
- A live countdown "Expires in 14:37" ticking to zero, after which the panel greys out and offers "Generate a new code".
- A Realtime subscription on that token row: when `is_claimed` flips true, show a **Terminal Activated Successfully!** toast, replace the QR panel with a success state, and refresh the terminal list automatically.

## 4. Terminal side

`src/lib/terminal-tokens.ts` `activateTerminal()` accepts the new prefix, checks `ts` age client-side for a fast message, then relies on the atomic claim for the real decision. Refusals map to clear text: expired code, already used (rejected as unauthorized), or revoked.

## Technical notes

- Files changed: `src/lib/terminal-crypto.ts`, `src/lib/terminal-tokens.ts`, `src/components/pos/TerminalTokens.tsx`; new `supabase/schema26.sql`.
- Payload keeps reading the connection values from the environment resolver, so each tenant's code carries that tenant's own database address and publishable key — nothing hardcoded.
- The code stays readable only to this build; enforcement remains the server-side single-use claim, not the cipher.
