# Database coverage audit, region/time settings, and DB-backed stock transfers

## What I found first (verified against the live database)

The database currently has only 17 tables: audit_logs, drawer_events, members, membership_tiers, pos_settings, products, promotions, purchase_orders, purchase_order_items, sales, sale_items, secure_settings, shifts, shift_sessions, sku_audit, suppliers, user_roles.

The app code reads or writes several things that **do not exist** in the database, so that data is either lost on cache clear or fails silently:

- `stores` (branches) — the app checks for it and skips when absent
- `terminal_tokens` — terminal activation
- `coupon_campaigns`, `issued_vouchers`, `coupon_events` — the whole coupon/member-signup module
- Staff/cashier accounts and permissions (all the `list_cashiers` / `upsert_cashier` / `verify_cashier_pin` style functions are missing)
- Stock transfers, bookings, stock adjustments, and held/receipt slips — these live only in browser storage today

Sales, exchanges (stored as flags/lines on sales), inventory, shifts, sign-in sessions, drawer opens, purchase orders, suppliers, members and settings **are** already stored in the database.

## Part 1 — Close the persistence gaps

Create the missing tables and access rules so every module writes to the database:

- Branches (`stores`) with their per-branch policy flags (private stock, private catalogue, transfers allowed, sync toggles)
- Staff accounts: employee record, staff ID, hashed PIN, assigned branch, role and the permission matrix, plus the lookup/verify functions the login screen calls
- Terminal activation tokens with claim/heartbeat/status functions
- Coupon campaigns, issued vouchers and coupon activity events
- Bookings/service jobs, stock adjustments, and held-order slips
- Receipts stay derived from sales; nothing extra needed there

Then update the app so each of these reads from the database first and uses local storage only as an offline cache.

## Part 2 — Region, date and time settings

Add a proper "Region & time" section in Settings:

- Country/region picker and time zone picker (searchable list)
- Date format and time format (12h/24h) and first day of week
- Live preview of the current date/time in the chosen settings
- All displayed and printed timestamps (receipts, reports, shifts, audit) use these settings instead of the PC clock

Saved with the rest of the business settings in the database so every terminal picks it up.

## Part 3 — Stock transfers (intra-group and inter-group)

### Data

Two new tables:

- `stock_transfers`: transfer number (TR-2026-0001), source branch, destination branch, status (PENDING, APPROVED, IN_TRANSIT, COMPLETED, REJECTED, CANCELLED), notes, created by, approved by, timestamps
- `stock_transfer_items`: transfer, product, quantity (must be positive)

Stock movement runs inside a single database function so quantities can never be half-applied: on completion it decreases the source branch stock and increases the destination branch stock, creating the destination stock row when the product was never held there.

### Cluster rules (isolation kept intact)

- **Intra-group** (both branches share the same catalogue/stock group): source creates the request, destination approves, stock moves.
- **Inter-group** (destination branch is an isolated/private cluster): on approval the product is mapped into the destination cluster's catalogue automatically and made visible there, so the receiving branch can sell it. No other catalogue or stock data crosses the boundary.
- Branches with transfers disabled cannot be chosen as source or destination.

### UI

A reworked "Stock Transfers" page replacing the current browser-only one:

- **New transfer form**: source pre-filled with the user's branch (admins can change it), destination dropdown listing all active branches with their group shown next to the name, multi-row product picker with live available stock at the source and a block on over-shipping, notes, submit as PENDING.
- **Lists** in three tabs — Incoming requests, Outgoing requests, Completed history — with columns Transfer #, From, To, Type (Intra-Group / Inter-Group), Total items, Status, Created, Actions.
- **Actions**: destination sees "Approve & receive" and "Reject"; source sees "Cancel" while still pending. Approvals respect the existing supervisor-approval setting.
- **Inter-group banner**: "Notice: this item will be mapped to the target cluster's catalogue upon transfer completion."
- Existing bulk Excel transfer import keeps working and feeds the new flow.

## Technical notes

- The app models branches as `stores` and per-branch stock as a per-store quantity map on products; the transfer functions will read and write through that model, with a branch-stock row created on demand for the destination.
- Every new public table gets grants plus row-level rules limited to signed-in staff, with approve/complete paths restricted to managers/supervisors/admins.
- Transfer numbers are allocated by the database to avoid duplicates across terminals.
- Local-first behaviour is preserved on desktop: writes go through the existing outbox queue; the Android live-only mode calls the database directly.
- Schema changes ship as migrations; the older unapplied `supabase/schema*.sql` files are treated as reference only.

## Sequencing

1. Migration: missing tables + functions (Part 1) and transfers (Part 3 data).
2. Wire app modules to the new tables and verify each section round-trips.
3. Region/time settings and formatting rollout.
4. Transfers UI and approval flow.
5. Version bump to 1.1.1.
