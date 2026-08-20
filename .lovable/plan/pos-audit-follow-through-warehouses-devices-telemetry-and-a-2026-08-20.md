# POS audit follow-through: warehouses, devices, telemetry and a receipt designer

## What the audit found (verified in code)

- **Hierarchy already exists.** `stores` carries `location_type` (store / main_building / sub_warehouse / central_warehouse), `parent_id`, `is_central`, `is_primary_sub`. `src/lib/locations.ts` provides the tree, routing targets, roll-up stock and archive guards; `/stores` renders the tree with inline sub-warehouse creation. Stock is keyed per location id in `product.stockByStore`, so two warehouses in one building are already separate buckets that roll up to the parent for branch totals.
- **Transfers** go through `stock_transfers` / `stock_transfer_items` and the atomic `stock_transfer_receive` database function, with a durable offline write gate.
- **Devices**: `terminal_tokens` stores a human `deviceName`, and the tokens screen uses it. But `branch_telemetry` publishes `terminal_name` set to the *location* name, not the device name — so the telemetry board and activity/audit rows show the wrong or a technical identifier.
- **Telemetry** has a 5-minute staleness helper but the board treats a terminal as reachable from its stored connection status; there is no Stale/Unknown state and no per-device recent-request feed.
- **Phone pairing** encodes/decodes a pairing request and issues a code, but after picking device + location it does not report whether that device is already active, active elsewhere, revoked or blocked.
- **Receipts** already have a rich profile (identity, three font scopes, custom lines, QR, logo data URL, booking slip terms/signature) with per-branch overrides — but no field-based template, no click-to-insert token list and no CSS control.

## What will be built

### 1. Device identity everywhere
- Store the device name on the terminal config at activation and stamp it into telemetry, activity events, audit rows and sync events.
- Telemetry gains `device_name`, `device_type` (PC / mobile), `location_name` and `warehouse` as distinct fields, with device name as the primary label in every list.

### 2. Telemetry centre rework
- Per-terminal card/row: device name, type, terminal id, branch, location/warehouse, activation status, connection, session, last seen, last heartbeat, app version, platform, current user.
- Live health is derived from heartbeat age: **Online** (< 2 min), **Stale** (2–15 min), **Offline** (older / explicitly offline), **Unknown** (never reported). Stale never renders as online.
- **Recent requests** feed: timestamp, device name, device id, branch, terminal, request type, status, result, duration, user — sourced from the existing activity/audit stream, filtered per device.

### 3. Phone-camera scanner activation flow
- After scanning and choosing device + location, the screen resolves and shows the real status: ACTIVE, NOT ACTIVATED, ACTIVE ELSEWHERE, OFFLINE, BLOCKED, REVOKED.
- When already active it shows device name, terminal, branch/location, activation time, last seen and session state, and offers Continue / Replace (confirmed) instead of silently minting a duplicate activation.

### 4. Warehouse and sub-warehouse verification pass
- Walk each location option end to end (UI → logic → database → sync → UI) for: private shop, private catalogue, log stock transfer, sync inventory, sync sales, shifts, members, sub-warehouse management — recording permission, route, write path, error and success state for each.
- Fix only confirmed defects: stock bleed between sibling warehouses, transfer source/destination records, archive guards, put-away routing when a branch has several sub-locations.
- Inventory dashboard breakdown stays: company → branch → sub-warehouse.

### 5. Sync status honesty
- Inventory and sales sync surfaces show Synced / Syncing / Pending / Failed / Offline with last success and last failure times; queued sales are never dropped on failure, and retries stay idempotent.

### 6. Receipt designer (extends the existing profile — no second system)
- **Content tab**: an ordered list of receipt blocks (header, logo, business info, meta, items table, totals, tender, booking/deposit, terms, signature, footer, custom text) that can be toggled, reordered and edited.
- **Fields palette**: click-to-insert approved tokens only — `{{receipt_number}}`, `{{date}}`, `{{time}}`, `{{cashier}}`, `{{terminal_name}}`, `{{device_name}}`, `{{branch_name}}`, `{{customer_name}}`, `{{item_code}}`, `{{item_name}}`, `{{quantity}}`, `{{unit_price}}`, `{{discount}}`, `{{tax}}`, `{{line_total}}`, `{{subtotal}}`, `{{total}}`, `{{payment_method}}`, `{{received}}`, `{{change}}`, `{{deposit}}`, `{{balance}}`. Resolution is a fixed whitelist map against real transaction data — no free-form data access.
- **CSS tab**: a scoped stylesheet. Every rule is rewritten under the receipt root before printing, `@import`/`url()`/external references are stripped, and paper width and thermal geometry stay fixed.
- **Live preview** with clearly labelled sample data, at the selected paper size, updating on every change.
- **Logo**: upload / preview / replace / remove, stored on the receipt profile (global or per branch) rather than on transaction rows.
- Sales receipts, booking slips and part-payment receipts all resolve through the same profile with existing branch overrides intact; historical bookings keep printing (missing fields fall back to today's behaviour).

## Security

- New privileged actions are permission-gated server-side as well as in the UI: activate / deactivate / transfer a device, change branch or warehouse assignment, edit a receipt template, upload a logo, edit CSS, change private shop / catalogue settings, privileged stock transfers.
- No existing guard is relaxed; route guards and the security tests are extended, not weakened.

## Technical notes

- Migration: add `device_name`, `device_type`, `location_name`, `session_status`, `last_heartbeat_at` to `branch_telemetry`; add `receipt_template` (jsonb) and `receipt_css` (text) to `pos_settings`, plus the matching branch-override fields. Grants, RLS and triggers follow the existing patterns, and the offline SQL Server / SQLite schema files are updated to match.
- New modules: `src/lib/receipt-template.ts` (block model + whitelist token resolver), `src/lib/receipt-css.ts` (scoper/sanitiser), `src/lib/device-identity.ts`, plus a `ReceiptDesignerPanel` in the settings sheet and an extended `TelemetryPanel`.
- `src/lib/pos-print.ts` renders from the block model when a template exists and falls back to the current fixed layout otherwise, so nothing that prints today changes until a template is saved.

## Validation

`bunx vitest run`, `tsgo --noEmit`, `bunx eslint`, `node scripts/logic-scan.cjs`, plus a production build. New tests cover the token resolver, the CSS scoper, telemetry staleness classification and the activation-status resolver.

## Delivery order

1. Device identity + telemetry + recent requests + phone-scanner status.
2. Warehouse / sub-warehouse and sync verification pass with targeted fixes.
3. Receipt designer (content, fields, CSS, preview, logo).
4. Second repository-wide audit written to `docs/second-audit.md` covering remaining bugs, incomplete features, broken flows, security concerns, data-integrity risks, UX problems, missing features and next actions ranked CRITICAL / HIGH / MEDIUM / LOW.
