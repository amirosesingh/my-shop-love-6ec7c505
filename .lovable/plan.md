# Feature-split SQL files + a real all-shops live analytics page

## Part 1 — Split the database script by feature

Today the whole backend lives in one 2,200-line `external-full-schema.sql`. It gets replaced by a numbered set of feature files, each self-contained and safe to re-run, plus a runner that loads them in order.

```text
supabase/sql/
  00_extensions_and_enums.sql     extensions, app_role enum, shared trigger functions
  01_stores_and_terminals.sql     stores, terminal tokens + pairing functions
  02_staff_and_access.sql         app_users, cashiers, user_roles, PIN/role functions
  03_catalog.sql                  products, categories, UOM, suppliers, barcode aliases
  04_register_sales.sql           sales, sale_items, held_orders, drawer_events
  05_shifts.sql                   shifts, shift_sessions, trading-hours settings
  06_inventory_ops.sql            purchase orders, stock adjustments, stock transfers
  07_members_and_loyalty.sql      members, tiers, promotions
  08_coupons_and_vouchers.sql     campaigns, issued vouchers, coupon events
  09_bookings.sql                 bookings, booking payments, racket job cards
  10_settings_and_integrations.sql pos_settings, secure_settings, whatsapp_queue
  11_audit_and_logs.sql           audit_logs, sku_audit
  12_analytics_views.sql          reporting views used by the dashboards
  99_run_all.sql                  ordered \i includes for a fresh install
```

Each file follows the same shape: create table -> GRANTs -> enable RLS -> policies -> indexes -> triggers, all with `if not exists` / `create or replace` so running it twice is harmless. The old combined file stays for one release as a pointer to the new folder, and `supabase/README.md` explains which file to run for which feature.

## Part 2 — All-shops live analytics page

A new page at **/analytics** ("Live Business Board"), promoted at the top of the Reports hub and in the sidebar next to Live Dashboard, so it is easy to find. It reads straight from the database across every shop, not just the till's current store, and auto-refreshes.

Top row of figures: revenue, gross profit and margin %, total discounts + coupons given away, bills and average basket, average per day and per month.

Charts:
- **Combined top items pie** — today's (or selected range's) top sellers across all shops, with an "everything else" slice.
- **Per-shop top item pies** — one small donut per shop in a responsive grid, so each branch's mix is visible side by side.
- **Revenue by shop donut** with share %.
- **Revenue vs cost vs profit** grouped bars per shop, with a margin % line.
- **Where the money went** stacked bars per shop: net revenue, item discounts, bill discounts, coupons, free items.
- **Trend line** of revenue and profit, switchable daily / monthly.

Controls: date range with quick presets (Today, 7 days, Month, Custom), shop multi-select, top-by revenue or units, and an export of the underlying rows to Excel. Empty ranges show a clear "no sales in this range" state instead of blank charts.

Access is limited to the sales-reports permission; staff without it will not see the entry.

## Technical notes

- Aggregation runs server-side through new SQL views in `12_analytics_views.sql` (daily item sales with cost and margin, per-shop daily totals, discount breakdown), queried via a server function so one page load does not pull every sale row into the browser.
- Reuse `src/lib/sales-analytics.ts` helpers for profit and savings so the numbers match the existing item and sales reports.
- Charts use the Recharts setup and theme tokens already used by `/reports/analytics`; the existing page stays as the single-store report and links to the new combined board.
