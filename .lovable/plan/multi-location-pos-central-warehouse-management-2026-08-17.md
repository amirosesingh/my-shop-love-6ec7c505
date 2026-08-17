# Multi-Location POS & Central Warehouse Management

Turns the flat store list into a proper location hierarchy (stores, main buildings, sub-warehouses on floors/annexes), routes all inbound stock through a central warehouse first, archives locations instead of deleting them, and blocks the app on first launch until a primary location exists.

## 1. Location model and metadata

Extend a location record with: type (`store`, `warehouse_main`, `sub_warehouse`), parent location, building name, floor/room designation, active/archived flag, plus the existing name, code, address, phone, group and receipt prefix. Everything stays fully editable at any time — renaming never touches historical rows.

New Locations screen (replacing the current Manage Locations page):
- Tree view: Main Building -> Ground Floor Outlet / 2nd Floor Vault / Annex Room.
- Create/edit form with type, parent picker (only non-sub locations can be parents), building, floor/room, address, contact.
- One location per company may be flagged **Central Warehouse** — the inbound entry point.
- Archive button instead of delete. Archiving is refused with a clear message while the location still holds positive stock; the operator must transfer stock out first.

## 2. Non-destructive data lifecycle

- Nothing auto-runs at launch: no schema creation, no reset, no seeding, no demo rows. All writes stay behind explicit UI actions.
- Locations are soft-deleted (archived) only; archived locations disappear from pickers but stay in reports.
- Receipts store a permanent snapshot of the store name and address at the moment of sale, so reprints and history stay correct after a rename.

## 3. Central-first inbound routing

Purchase receiving, external returns and multi-branch distributions all land in the Central Warehouse context first, then route onward:
- If the destination branch has exactly one sub-warehouse, the system picks it automatically.
- If it has several, a target selector appears (floor / room / annex) before posting.
- The onward move posts as a single atomic operation: source balance down, destination balance up, in one write, with an item activity log entry.

## 4. Inventory visibility

The inventory dashboard gains a breakdown by location node — company-wide total, per branch, and per floor/sub-warehouse — with a toggle to roll children up into their parent.

## 5. Connection pool isolation and admin query tool

Already in place from the previous change and kept as-is: the operational POS pool and the Admin Explorer pool are separate, and the Database Explorer is admin-only. This work re-verifies the read-only guard so anything other than a plain read (insert, update, delete, drop, alter, truncate, exec, merge) is rejected before it reaches the server, and confirms admin context switches never touch the POS pool.

## 6. Boot check

On startup the app reads the location list once. With zero active locations it blocks the register and inventory, shows a modal — "No active store or warehouse found. Please create your primary location to continue." — and sends the user to the Locations setup screen. With at least one active location the app boots normally.

## Technical notes

- Migration adds to `public.stores`: `location_type text not null default 'store'`, `parent_id text references public.stores(id)`, `building_name text`, `floor_label text`, `is_active boolean not null default true`, `is_central boolean not null default false`; partial unique index so only one central location exists. No data seeding.
- Migration adds to `public.sales`: `store_name_snapshot text`, `store_address_snapshot text`; populated by `saleToRow` in `src/lib/pos-db.ts` at commit time. Receipt rendering in `src/lib/pos-print.ts` prefers the snapshot.
- Same columns mirrored into `db/offline/pos-offline-sqlserver.sql` and `electron/db/offline_sqlite_v2.sql` with idempotent guards.
- `Store` type in `src/lib/pos-types.ts` plus `rowToStore`/`storeToRow` extended; `removeStore` becomes `archiveStore` (sets `is_active=false`) with a stock-balance precheck against `stock_by_store`.
- `src/routes/stores.tsx` rebuilt as a tree + editor; `src/routes/purchasing.tsx` and transfer creation get the central-first target selector; `src/routes/inventory-hub.tsx` gains the per-node breakdown.
- Boot gate added as a small guard component rendered in `src/components/pos/AppShell.tsx`, reading already-loaded state — no extra query on every page.
- `electron/db/admin-pool.cjs` read-only validator re-checked; POS pool in `electron/db/pool.cjs` untouched.
