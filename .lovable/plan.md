# Add a Warehouse User Role

A fourth staff role — **Warehouse** — for stock people who move and receive goods across every location but never sell.

## What a warehouse user can do

Allowed:
- Stock transfers: create, send, receive and approve transfers/requests between all locations
- Purchasing & receiving: create POs, enter supplier invoices, add new items, receive stock
- Inventory: view and edit stock quantities across every store

Blocked:
- Register / checkout, shifts, cash drawer, refunds, exchanges, promotions
- Product cost/selling price editing, sales reports, revenue figures, Z-reports
- Staff management and POS settings

## Access model

- Warehouse users see **all stores** and get the branch switcher, but only for stock context — no financial figures anywhere.
- Login: **email + password**, on the same tab supervisors and admins use. No PIN.
- Created from Staff Management alongside supervisors/admins; the role dropdown gains "Warehouse" and the store assignment is fixed to "All stores".

## Navigation

A warehouse user's sidebar shows only: Inventory Catalog, Purchasing, Stock Transfers, and Locations (read-only). Everything else is hidden.

## Technical notes

- `src/lib/permissions.ts`: add `"warehouse"` to `StaffRole`, and add a `WAREHOUSE_PERMISSIONS` preset (view inventory, edit stock quantity, receive PO, add product, transfers) with every sale/financial key off.
- Database migration: add a `warehouse` value to the `app_role` enum, allow it on `app_users.role`, and include it in `is_staff()`. Warehouse accounts are Auth users mirrored into `app_users` with `store_id = null`. The same statements are appended idempotently to `supabase/schema_final.sql` so the external database stays in sync.
- `src/lib/pos-auth.tsx`: derive `isWarehouse`; set `canSwitchStores = true`, `isCashier = false`, and never `isSupervisor`, so financial screens stay closed.
- `src/components/pos/nav-config.ts`: add a per-item warehouse visibility hint so admin-only entries stay hidden while inventory, purchasing and transfers show.
- `src/routes/staff.tsx`: role dropdown adds Warehouse; branch selector locks to "All stores"; account creation reuses the existing email/password path.
- `src/routes/inventory.tsx`, `purchasing.tsx`, `transfers.tsx`: hide cost/price columns and price-edit controls for warehouse users.