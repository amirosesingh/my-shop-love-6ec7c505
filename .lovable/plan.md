# Make every till write sync, and keep credentials encrypted

## Why writes are being rejected today

The central database only accepts writes from a signed-in staff account: each
rule checks `is_staff_now()` (a role row for the signed-in account) and
`store_visible(store_id)` (the row's branch matches the staff member's branch).

Two situations break that:

1. A cashier who signs in with a **username + PIN** has no account on the
   central database at all. The PIN is checked by a database routine, but the
   till itself is still an anonymous visitor afterwards, so every queued write
   (`shift_sessions`, `shifts`, sales, bookings...) is refused. This is the
   "This terminal is not allowed to write ..." message.
2. A staff record with a branch assigned cannot write rows stamped with a
   different branch, and rows are sometimes stamped with a branch id that never
   made it into the `stores` table.

The message itself is also misleading: any refusal is reported as "run
schema17.sql", regardless of the real reason.

## What gets built

### 1. Terminal accounts (the normal path)

When a terminal is activated it is issued its own hidden login on the central
database, tied to the branch chosen during activation:

- Activation creates the account, links it to a staff record with the right
  branch, and returns credentials the desktop/Android shell stores encrypted on
  the device (never in plain browser storage).
- On PIN sign-in the till signs in as its terminal account, so every write
  carries a real identity and passes the branch rules. The cashier's name is
  still recorded on each row for attribution.
- A revoked terminal loses the account, so it stops syncing immediately.

### 2. Server relay (the fallback)

Tills that are not activated yet — and any queued write that still fails —
push their queue to a new endpoint on our own server instead of straight to the
database. The endpoint verifies the terminal token or the signed cashier
session, checks the branch, then writes with a privileged key the browser never
sees. This needs the central project's secret service key, saved once as an
encrypted secret.

The outbox keeps its ordering and retry behaviour; only the transport changes.

### 3. Branch and identity self-healing

- Activation and shift open verify the branch exists in `stores` and create it
  when the till knows a branch the cloud does not.
- Sign-in checks that a staff/role row exists for the account and reports
  precisely what is missing instead of a generic message.
- Sync errors are rewritten into plain causes: "not signed in", "this account
  has no branch access to X", "table missing" — each with a Fix button that runs
  the matching repair (link branch, re-activate terminal, retry queue).
- Sync & backup gains a "Connection check" panel: signed-in identity, staff
  role, branch, terminal state and a per-table write test, so a failure shows up
  before a shift starts.

### 4. Encrypted credentials and keys

Everything in the credentials-and-keys class is stored as ciphertext, never as
readable text, in all three places (cloud, local SQL Server, device):

- WhatsApp token and phone number id, bank account number, printer/service
  credentials, the central-database service key, terminal tokens and terminal
  account passwords, and cashier/manager PINs (already hashed — kept that way).
- Cloud: the existing encrypted `secure_settings` store, extended to cover the
  new keys; only masked hints ever reach the screen.
- Local SQL Server: a matching encrypted table with a machine-bound key held by
  the desktop shell, so copying the database file yields nothing readable.
- Device/browser: credential entries move out of plain `localStorage` into the
  encrypted store; only non-sensitive preferences stay in the clear.

A one-time migration re-encrypts any value currently held in plain form and
deletes the plaintext copy.

## Technical notes

- New: activation-time provisioning of a terminal auth account, a
  `/api/public/sync` relay endpoint (token-verified, service-key writes),
  `store_visible` diagnostics, and an encrypted local settings table with
  helpers mirroring `settings-crypto.server.ts`.
- The central project's service key is requested once through the secure secret
  form and read only inside server handlers.
- SQL mirrored into `supabase/sql/` so the external backend matches, plus a
  one-shot repair script for existing rows whose branch is unknown.