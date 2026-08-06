# Fix booking sync + add item-level sales history and a business analytics board

## 1. Fix "error while syncing the bookings"

The bookings tables exist and are correctly granted — the problem is the access rules on the
payments table. Verified against the live database:

- `booking_payments` has rules for **read** and **create** only. There is no rule for **change**
  or **remove**.
- Saving a booking clears the existing payment rows and re-writes them. The clear step silently
  removes nothing, then re-writing the same payment rows collides with the rows already stored,
  and the save fails.

Fix (one migration plus a small code change):
- Add change/remove rules on `booking_payments` for staff, matching the rules already on `bookings`.
- Add a remove rule on `bookings` for staff so cancelled drafts can be cleaned up.
- Make the payment write idempotent in `src/lib/bookings-db.ts` (upsert payments keyed on the
  payment id instead of delete-then-insert), so a retry can never collide again.
- Same treatment for the offline queue path in `commitBooking` so queued bookings replay cleanly.

## 2. Item-by-item sales history report

New page `/reports/items`, in the same shell as the existing report pages.

One row per sold line, with a date range and filters for store, cashier and product:
date, time, receipt no, store, cashier, product, barcode/SKU, unit, qty, unit price, discount,
tax, line total, **cost price**, **margin (value)** and **margin %**. A totals strip on top:
lines, units, revenue, cost, gross profit, average margin %. CSV export via the shared
`downloadCsv` helper.

Cost capture: `sale_items` stores no cost today, so margins on past bills would drift as prices
change. The migration adds a `unit_cost` column, the till writes the product cost at the moment
of sale, and rows saved before this change fall back to the product's current cost (flagged in
the UI as an estimate).

## 3. Business analytics board

New page `/reports/analytics`, styled like the All Shops panel and using the charting library
already in the project (recharts, as on the live dashboard):

- **Top selling items** — horizontal bar chart, switchable between units sold and revenue, top 10.
- **Revenue by shop** — donut chart for the selected period with a share % per shop.
- **Daily and monthly revenue** — bar/line chart with a toggle, plus average per day and per month.
- **Savings given away** — total discounts, promotion value, coupon/voucher value and free-item
  value as cards plus a small breakdown chart.
- **Profit** — revenue, cost, gross profit and margin % per shop, on the same cost basis as the
  item report.

All figures come from data already loaded in the POS store (sales, sale lines, stores, products),
filtered by the shared date-range header, so no extra network calls.

## Technical notes

- Migration: change/remove policies on `booking_payments`, remove policy on `bookings`,
  `unit_cost numeric not null default 0` on `sale_items`.
- `src/lib/bookings-db.ts`: upsert payments instead of delete + insert (online and queued paths).
- `src/lib/pos-db.ts`: write `unit_cost` in `saleItemRows` and read it back into the sale line.
- New routes `src/routes/reports.items.tsx` and `src/routes/reports.analytics.tsx`, reusing
  `report-kit.tsx` (`ReportHeader`, `StatCard`, `downloadCsv`) and `TablePagination`; both added
  to the reports group in `nav-config.ts` with their own head metadata.
- Margin maths kept in one shared helper so both new pages agree.