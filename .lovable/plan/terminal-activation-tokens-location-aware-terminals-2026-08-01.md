# Terminal Activation Tokens & Location-Aware Terminals

Three connected pieces: an admin token issuer, a terminal activation + kill-switch, and location-scoped sync.

## 1. Locations move into the database

Locations currently live only in this terminal's local storage, so the token issuer has nothing central to point at. Add a `stores` table to the POS database and make the Locations screen read/write it (with the existing offline outbox, so it still works without internet). Existing local locations are pushed up on first load.

Because the POS data lives in your own database (not the Lovable-managed one), the schema arrives as a script — `supabase/schema10.sql` — for you to run once. It creates:

- `stores` (id, name, code, address, phone, timestamps)
- `terminal_tokens` (id, location_id, device_name, status active/revoked, created_at, revoked_at, last_seen_at)
- Staff-only access rules matching the existing tables.

## 2. Admin: Terminal Activation page (`/settings/terminals`)

Enterprise dashboard styling using the existing card/badge/table components.

- **Generator card**: Location/Warehouse dropdown (from `stores`), Terminal / Device Name input, primary "Generate Activation Token" button.
- On generate: create a token row, then build a payload `{ token_id, location_id, location_name, supabase_url, supabase_key }`, encrypt it with **AES-256-GCM via the browser's built-in Web Crypto**, base64 it, and show it as a scannable QR (existing `qrcode-generator` dep) plus a copyable text block with a copy button.
- **Issued tokens table**: Device Name | Location | Status badge | Date created | Last seen | Revoke.
- Revoke uses a confirmation dialog ("Are you sure you want to disconnect this terminal?") and flips status to `revoked`.
- Admin-gated behind `can_access_pos_settings`, added to the System & Settings nav group.

## 3. Terminal: activation + revocation kill-switch

- **Activation view** shown on desktop before the terminal is registered: paste/scan the code (camera scanning via `html5-qrcode`, text paste always available), decrypt, verify the token row is `active`, then save `token_id` + `location_id` + location name locally and mark the terminal registered. Invalid or revoked shows a red alert: "This activation code has been revoked by management."
- **`useRevocationCheck` hook**: polls the token status every 5 minutes and immediately when the machine comes back online. On `revoked` it wipes the saved terminal config and shows a full-screen lock: "This device's authorization has been revoked by the master administrator." Full lock, as you chose.
- Offline behaviour: no network, no check, selling continues untouched. Revoked while online blocks cloud sync as well as the screen.

## 4. Location-aware operations

- Fixed top-bar pill in the app shell: "Location: Warehouse A — Main Store", next to a combined indicator for network state and token status (Active / Blocked).
- Product/inventory reads and all sales, stock movements and outbox pushes are stamped and filtered by the terminal's registered `location_id`.
- "Pending offline transactions" modal from the pill: lists queued operations bound to this location before syncing.

## Technical notes

- New dependency: `html5-qrcode` for camera scanning. QR rendering reuses `qrcode-generator`.
- Encryption key: a per-install app secret stored via the existing secure-settings mechanism; the token is treated as a credential, but true enforcement is the server-side status check, not the cipher.
- New files: `src/lib/terminal-tokens.ts`, `src/lib/terminal-crypto.ts`, `src/lib/use-revocation-check.ts`, `src/routes/settings.terminals.tsx`, `src/components/pos/TerminalActivation.tsx`, `src/components/pos/LocationPill.tsx`, `supabase/schema10.sql`.
- Touched: `pos-store`, `pos-db`, `sync-engine`, `AppShell`, `nav-config`, `stores` route, permissions test snapshot.
