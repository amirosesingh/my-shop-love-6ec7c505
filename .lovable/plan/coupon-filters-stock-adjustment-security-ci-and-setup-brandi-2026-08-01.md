# Coupon filters, stock adjustment, security CI, and setup branding

## 1. Coupon report filters (`/reports/coupons`)

Add a filter bar above the stats:

- Coupon code search (partial match)
- Partner / collaborator select — see below
- Scope: All / Whole bill / Item
- Status: All / Applied / Removed / Redeemed
- Staff member select
- Branch select

Stat cards and CSV export recalculate from the filtered rows, so "how much did partner X redeem" is one selection away. A per-code summary table (code, times redeemed, total value given away) is added under the event table.

### Partner attribution

Promotions get an optional `partner` field (free text, e.g. "Sarah — Instagram"), edited on `/promotions`. The coupon report resolves each coupon code to its promotion and shows a partner column; the partner filter groups all codes belonging to that collaborator. Coupons with no matching promotion show "Unattributed".

## 2. Stock adjustment (inventory)

New "Adjust stock" action per product row and a bulk "Stock check" mode on `/inventory`:

- Single adjust dialog: current system count, counted/new count, auto-calculated difference, reason (Stock count, Damage, Theft/Loss, Expiry, Correction, Received off-PO), note.
- Stock check mode: filter by category, enter counted quantities for many products, review a variance summary (over / short / value impact), then commit in one go.
- Every adjustment writes an audit entry (product, branch, before, after, delta, reason, staff, timestamp) and appears in a new "Stock Adjustments" report under Reports & Analytics with date range, branch and reason filters plus CSV export.
- Adjustments persist to the backend and the local offline database through the existing sync outbox, so counts survive offline use.

## 3. Security review and automated checks

Review and tighten fit:

- Re-run the database linter and security scan; fix anything real that turns up.
- Audit route-level and action-level permission gating for the newer features (reports pages, coupons, stock adjustment, bookings, settings pages) so each has an explicit permission flag rather than relying on being unlisted.
- Confirm every table's policies still match intent after the recent feature growth, and that no new table is reachable without a staff check.

Then automate, so regressions are caught before release:

- A permissions snapshot test: the full role → permission matrix is serialised into a checked-in snapshot. Any change to who can do what fails CI until the snapshot is deliberately updated.
- Route-guard tests asserting each protected route declares a permission flag and that a cashier-level role is denied admin-only routes.
- A GitHub Actions workflow on push/PR running install, lint, typecheck, the permission tests, and a dependency vulnerability scan (high/critical fails the build).

## 4. Company name at install / first run

Today "Northwind" is hardcoded in the sidebar, login screens and receipt defaults.

- Add a first-run setup screen in the desktop app: company name (required), branch/terminal name, optional phone and website. It runs once before login when no company name is stored, and writes into the existing settings store.
- Replace every hardcoded "Northwind" in the shell, login screens and terminal badge with the configured company name; the sidebar subtitle shows the configured terminal/branch name instead of the fixed "POS Terminal 01".
- The same values stay editable later at Settings → Business identity, which remains the single source of truth (receipts already read from it).
- Page titles fall back to a neutral product name when no company is set yet.

## Technical notes

- Coupon filters are local state in `reports.coupons.tsx` plus a shared filter component in `report-kit.tsx`; partner comes from a new nullable `partner` column on `promotions` (migration keeps existing grants/policies).
- Stock adjustments use a new `stock_adjustments` table (product_id, store_id, before, after, delta, reason, note, staff, created_at) with staff-only RLS and explicit grants, mirrored in the local SQL Server schema and sync worker.
- Company/terminal identity is stored in the existing settings record; the Electron first-run screen renders before the auth gate when identity is unset.