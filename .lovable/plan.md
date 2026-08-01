# Encrypted settings, customer-display transfer, offline-first sync, Windows desktop

## What already exists (verified)

- Settings already has a **Bank transfer** tab and a **WhatsApp bills** tab (`src/routes/settings.tsx`), stored in `pos_settings` as plain columns/JSON.
- `/display` already renders bank name, account name, account number, WhatsApp number and a WhatsApp QR, and highlights a "Please transfer to" mode; it syncs through `BroadcastChannel` with a `localStorage` fallback (`src/lib/customer-display.ts`).
- App state is written to `localStorage` and mirrored to the cloud through `src/lib/pos-db.ts`, but those writes are fire-and-forget: a write that fails while offline is lost and never retried.

So the work is: **encrypt the credentials**, **finish the transfer screen with a payment QR**, **add a real sync queue**, and **wrap it as a Windows .exe**.

---

## 1. Encrypted settings (WhatsApp + bank credentials)

AES-256-GCM inside a server function, key from a generated secret. The browser never holds the key; the database only ever holds ciphertext.

- New table `public.secure_settings` (`key`, `ciphertext`, `updated_at`), service-role only — no `anon`/`authenticated` grants, so no client can read it directly.
- `src/lib/settings-crypto.server.ts` — `encryptSetting` / `decryptSetting` using `node:crypto` (`iv | authTag | ciphertext`, base64), key from a generated `SETTINGS_ENCRYPTION_KEY` secret that is never revealed to anyone.
- `src/lib/secure-settings.functions.ts` — auth-guarded server functions:
  - `saveSecureSetting` (admin/manager only) — encrypts and upserts.
  - `getSecureSettingMasked` — returns `•••• 4821`-style masks for the UI, never plaintext.
  - Plaintext is decrypted only inside the handlers that actually call out (e.g. WhatsApp send).
- Settings UI: sensitive fields (WhatsApp phone-number ID and token, bank account number) show the mask with a "Replace" button; entering a new value saves through the server function. Non-sensitive display fields (bank name, account holder) stay in `pos_settings`.
- Ciphertext carries a `v1:` prefix so a future key rotation is detectable.

## 2. Customer display — bank transfer block

- Add `paymentQr` to `PaymentDetails`: `{ mode: "static" | "dynamic", payload: string }`, where dynamic payloads interpolate `{amount}` / `{reference}` (EMVCo / UPI / DuitNow-style strings work as-is).
- Settings gains a Payment QR sub-section: paste the payload, pick static vs dynamic, live preview.
- `DisplaySnapshot` gains the resolved QR payload; the register publishes it the moment "Bank transfer" is selected, so the second screen switches to full transfer mode: amount due, bank name, account holder, account number in large type, reference, and the payment QR beside the WhatsApp QR.
- Sync stays on `BroadcastChannel` with the existing `localStorage` fallback — that already works across windows and will work inside the Electron shell, so no WebSocket server is needed.

## 3. Offline-first sync engine

- **Outbox** (`src/lib/sync-outbox.ts`): every mutation currently sent through `db.*` is first appended as an operation `{ id, entity, op, payload, entityVersion, createdAt, attempts }` and applied to local state immediately. The UI never awaits the network.
- **Sync worker** (`src/lib/sync-engine.ts`): drains the outbox in order when `navigator.onLine` is true and the Online Sync toggle is on; exponential backoff, quarantine after N failed attempts, plus a pull pass fetching rows changed since `last_synced_at`.
- **Online Sync toggle** in Settings, plus a header pill showing `Online / Offline / N pending`. Off means queue only, never touch the network.
- **Conflict resolution**
  - Sales, bookings, shifts and audit logs are append-only and immutable: they always win, never merged.
  - Catalog/settings rows (products, tiers, promotions, `pos_settings`) use `version` + last-write-wins on `updated_at` with a server-side version check; a losing local edit is surfaced in a "Sync conflicts" list rather than silently dropped.
  - Stock reconciles as **deltas**, not absolute values, so two offline terminals selling the same SKU both decrement correctly.
- **Backup/export**: Settings action to export the full local dataset as a `.sql` dump (INSERT statements per table) and, for admins, a cloud snapshot export through a server function. Restore accepts the same format behind a confirmation.

## 4. Windows desktop shell

Recommendation: **Electron** with `@electron/packager` — it packages from this environment, keeps the Node APIs the SQLite layer needs, and produces a portable `.exe`.

- `electron/main.cjs` — BrowserWindow with `contextIsolation: true` loading the built `dist/`, plus a **second BrowserWindow placed on the detected secondary monitor** pointed at `/display`, giving native dual-screen instead of a popup.
- `electron/preload.cjs` — narrow IPC bridge: `sqlite.query`, `backup.export`, `printer.raw` (cash-drawer / ESC-POS kick without the browser print dialog).
- Local database: `better-sqlite3` in the main process holding the same tables plus `is_synced`, `last_synced_at`, `version`. In the browser build the same interface is backed by IndexedDB, so one codebase serves both.
- `vite.config.ts` gets `base: './'` so assets resolve under `file://`.

## Technical notes

SQL added by this work:

```sql
create table public.secure_settings (
  key text primary key,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.secure_settings to service_role;
alter table public.secure_settings enable row level security;

-- sync tracking on syncable tables
alter table public.products
  add column if not exists version integer not null default 1,
  add column if not exists updated_at timestamptz not null default now();
-- same pair for members, promotions, bookings, shifts, sales, pos_settings
```

Local-only columns `is_synced` / `last_synced_at` live in SQLite/IndexedDB, not in the cloud schema.

## Suggested order

1. Encrypted settings + secure WhatsApp/bank credential storage.
2. Payment QR + customer-display transfer screen.
3. Sync outbox, Online Sync toggle, conflict rules, backup export.
4. Electron shell, dual-monitor display window, SQLite adapter, `.exe` packaging.

These are four sizeable chunks; I will build them in that order and check in after each so nothing lands half-wired.