# Permission matrix refresh — cover every feature

The matrix in Staff Management has grown behind the app: several screens shipped since it was last updated have no toggle at all, and some screens are only hidden in the sidebar while still reachable by typing the URL. This aligns the matrix with the feature set as it exists today.

## 1. New permission toggles

Added to the matrix, grouped so the Staff Management screen stays readable.

Sales & Checkout
- Reprint / re-issue a bill
- Send a bill by WhatsApp
- Take and collect bookings (pay later)

Cash Drawer & Shifts
- Open a shift
- Close a shift and run the Z-report

Inventory & Supply
- Create and send stock transfer requests
- Approve / receive an incoming transfer
- Manage locations and warehouses (currently borrows the "view inventory" toggle)

Members & Loyalty
- Redeem loyalty points at the till
- View a member's purchase history

Reports & Analytics
- View the live dashboard
- View the register activity / audit trail (currently borrows "view sales reports")
- Export or download report data

System
- Manage terminal activation tokens
- Run sync, backup and restore
- Edit promotions and coupon rules (currently borrows "access POS settings")

## 2. Close the URL-access gaps

Today only `/settings`, `/staff`, `/stores`, `/promotions` and `/audit` are checked when a route loads. Everything else is only hidden from the sidebar, so a signed-in cashier can still reach `/dashboard`, `/reports/*`, `/inventory`, `/purchasing`, `/receipts`, `/shifts`, `/transfers`, `/bookings` and `/members` by URL.

Every screen gets an entry in the route guard so the sidebar rule and the route rule always agree, redirecting back to the register when the toggle is off.

## 3. Role presets

- Cashier: register, hold, reprint bills, bookings, member lookup and add, open/close own shift. No reports, no dashboard, no exports, no transfer approvals.
- Warehouse: inventory, purchase orders, stock adjustment, transfers (create and receive), locations. No money screens.
- Supervisor / Admin: everything, as now.

Existing staff accounts keep their current toggles; newly added toggles default to off for cashier and warehouse, on for supervisor and admin.

## 4. Regression tests

The existing security suite is extended so the build fails if:
- a permission key exists that no group on the Staff Management screen shows,
- a route file exists with no entry in the route guard map,
- a cashier or warehouse preset gains a money, settings or staff-control toggle.

## Technical notes

- `src/lib/permissions.ts`: extend `PermissionKey`, `PERMISSION_LABELS`, `PERMISSION_GROUPS`, and the `CASHIER_PERMISSIONS` / `WAREHOUSE_PERMISSIONS` presets. `normalizePermissions` already ignores unknown keys and fills missing ones from the role preset, so stored matrices migrate without a data change.
- `src/components/pos/AppShell.tsx`: replace `ADMIN_PATHS` with a complete `ROUTE_PERMISSIONS` map keyed by path prefix, still exempting `/` and `/display`.
- `src/components/pos/nav-config.ts`: attach the new flags to their nav items so sidebar and route guard read the same source.
- Screen call sites (`shifts.tsx`, `transfers.tsx`, `bookings.tsx`, `members.tsx`, `receipts.tsx`, `settings.terminals.tsx`, `settings.sync.tsx`) use the existing `hasPermission` to hide buttons and `requirePermission` where a manager PIN override should be offered instead of a hard block.
- Tests extended in `src/lib/__tests__/permissions.security.test.ts` and `route-guards.security.test.ts`. No database or schema change: permissions are stored as JSONB on the staff record.