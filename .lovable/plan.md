# Add a Warehouse User Role

A fourth staff role — **Warehouse** — for stock people. Nothing is hard-locked: every feature is a toggle in the same permission matrix used for other staff, so an admin decides exactly what each warehouse user can do.

## Defaults (starting point only — all editable)

A new warehouse user starts with these turned on:
- Stock transfers between locations
- Purchasing and receiving (POs, supplier invoices, adding items)
- Inventory view and stock quantity editing

Everything else (register, shifts, drawer, refunds, exchanges, prices, sales reports, promotions, settings, staff management) starts off. An admin can switch any of them on later from Staff Management — the same toggle switches used for cashiers and supervisors, with no role-based hard blocks.

## Access model

- Warehouse users default to **all stores** with the branch switcher, but the assignment dropdown also allows pinning them to a single location.
- Login: **email + password**, on the same tab supervisors and admins use. No PIN.
- Created from Staff Management alongside supervisors/admins; the role dropdown gains "Warehouse".

## Navigation

The sidebar is driven purely by the toggles — each menu entry appears when the matching permission is on, so turning on e.g. refunds immediately reveals that screen for that user.

## Technical notes

- `src/lib/permissions.ts`: add `"warehouse"` to `StaffRole` and a `WAREHOUSE_PERMISSIONS` **default preset** (inventory, stock qty, receive PO, add product, transfers). `normalizePermissions` uses it as the base for the warehouse role but stored JSONB values always win, so admins can toggle anything on or off.
- Database migration: add a `warehouse` value to the `app_role` enum, allow it on `app_users.role`, and include it in `is_staff()`. Warehouse accounts are Auth users mirrored into `app_users` with `store_id = null`. The same statements are appended idempotently to `supabase/schema_final.sql` so the external database stays in sync.
- `src/lib/pos-auth.tsx`: derive `isWarehouse`; `canSwitchStores` follows the store assignment (all stores → switcher). Permission checks stay flag-driven, not role-driven.
- `src/components/pos/nav-config.ts`: give the currently `adminOnly` entries a permission flag as well, so a warehouse user with that toggle on sees them instead of being blocked by role.
- `src/routes/staff.tsx`: role dropdown adds Warehouse; the full 19-toggle matrix renders for warehouse users exactly as it does for cashiers; store assignment allows "All stores" or a single branch.
- Price/financial columns in inventory, purchasing and transfers key off `can_edit_product_price` / `can_view_sales_reports` toggles rather than the role.