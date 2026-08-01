# Coupon Tracking + Register Event Trail + Reports Centre

Today the register applies a coupon as a plain bill discount: the code is held in screen state only, it is not saved on the sale, and nothing is written to the activity trail. Holding an order, resuming it, voiding a cart and splitting a bill are also invisible afterwards. There is no Reports area in the sidebar.

## 1. Coupon tracking (bill-level and item-level)

- The coupon dialog gets a scope choice: **whole bill** or **one selected item** from the cart.
- The applied coupon is stored on the ticket: code, matched promotion, scope, discount value, target item (when item-level), who applied it, whether a supervisor override was used, and the timestamp.
- Applying and removing a coupon each write an activity entry with those details.
- The coupon rides along to the finished sale, so every bill records which coupon was used and what it took off. Item-level coupons are stored against that specific sale line.
- Receipt search and the member history dialog show the coupon on the bill.

## 2. Register event trail with timestamps

New activity entries, each with the exact time, terminal, branch, staff member and role:

- Order held (item count, value, hold reference) and order resumed (how long it sat on hold).
- Cart voided (lines, value, whether a supervisor approved it).
- Bill split (number of ways, amount per share, balance due).
- Coupon applied / coupon removed (from section 1).
- Product added to or edited in the catalog already logs; the report surfaces the created and edited timestamps, and a database `updated_at` stamp is added to products so edits are timestamped server-side too.

## 3. Reports section in the sidebar

A new **Reports & Analytics** group with its own pages:

- **Reports home** (`/reports`) — tiles for each report with a shared date range and branch filter.
- **Sales summary** (`/reports/sales`) — bills, gross, discount, tax, net, by day / cashier / payment type.
- **Coupons & discounts** (`/reports/coupons`) — every coupon use: time, code, bill number, item or whole bill, amount taken off, cashier, member. Totals per code.
- **Register activity** (`/reports/activity`) — timeline of holds, resumes, voids, splits, drawer opens and reprints with timestamps.
- **Catalog changes** (`/reports/catalog`) — products created and edited with timestamps, old vs new price and stock.
- **Shift & Z-reports** (`/reports/shifts`) — shift open/close with totals and variance.

Every report has CSV export and pagination, and follows the existing permission gate (`can_view_sales_reports`); an admin sees all branches, other staff see their own.

## Technical notes

- Migration: add `coupon_code`, `coupon_promo_id`, `coupon_scope`, `coupon_discount` to `public.sales`; `coupon_code` and `coupon_discount` to `public.sale_items`; `updated_at` (with touch trigger) to `public.products`. Grants and existing staff-only RLS stay as they are.
- `src/lib/pos-types.ts`: extend `Sale` and `CartLine` with the coupon fields; `src/lib/pos-db.ts` maps them in both directions (cloud and local Electron path).
- Register events go through the existing `logger` in `src/lib/audit-log.ts` using the current human-readable categories (`sale`, `refund`, `promotion`), so they sync to `audit_logs` with the offline queue already in place.
- Reports read from the existing sales / sale_items / audit_logs / products data through `src/lib/pos-db.ts`, with a shared `src/lib/reports.ts` for the date-range aggregation and CSV helpers; no new tables beyond the columns above.
- New routes `src/routes/reports.index.tsx` and `reports.*.tsx`, plus a `reports` group in `src/components/pos/nav-config.ts` and the route gate in `AppShell.tsx`.
