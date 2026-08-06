# Backend storage audit, one-file SQL for your external database, and correct log categories

## What the scan found

The app talks to 22 tables and 22 database routines directly, plus `sale_items`,
`purchase_orders`, `purchase_order_items`, `shifts`, `shift_sessions`,
`drawer_events`, `sku_audit`, `app_users`, `cashiers` and `user_roles` through the
sync layer — 31 tables in total. On the Lovable-managed database all of those exist.
Your external database was built from the older `schema7..schema25.sql` files, so
anything added later (booking slip settings, item cost on sale lines, transfer
tables, voucher lifecycle columns, terminal pairing columns, category/UOM tables)
may be missing there, which is why some data silently fails to save.

Three areas are still browser-only and never reach any database:

- Held / parked tickets (`held-orders`)
- Stock adjustment records (only an activity-log line is kept, no adjustment row)
- The WhatsApp send queue

Everything else — sales and sale lines, daily takings, item sales with cost,
inventory, purchases, shifts and sign-ins, drawer opens, members, coupons and
vouchers, campaigns, promotions, suppliers, transfers, bookings, settings and the
activity log — already has a table.

## Part 1 — One SQL file for your external backend

Create `supabase/external-full-schema.sql`: a single, re-runnable script you paste
into your SQL editor. It is safe to run on an existing database — every statement
is `IF NOT EXISTS` / `CREATE OR REPLACE`, so nothing is dropped and no data is lost.

It contains, in order:

1. Enum `app_role` and the shared timestamp trigger functions
2. All 31 tables with every column the current app version expects, and
   `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for columns added after your last run
   (`sale_items.unit_cost`, `pos_settings.booking_slip`, region/time fields,
   `issued_vouchers` disabled fields, `terminal_tokens.platform`/pairing,
   `products.barcode_aliases`/`packs`/`unit`/`sub_category`, transfer scope fields)
3. 3 new tables: `held_orders`, `stock_adjustments`, `whatsapp_queue`
4. `GRANT` statements for every public table (authenticated + service_role, anon
   only where the public claim pages need it)
5. Row-level security enabled plus the policies (staff read/write, admin-only for
   staff accounts and settings)
6. All database routines the app calls, including the login, terminal, coupon,
   voucher and transfer functions
7. A closing verification query that lists any table or function still missing, so
   you can see at a glance that the run was complete

## Part 2 — Store the three missing areas

- Held tickets, stock adjustments and the WhatsApp queue start writing to the
  database through the existing durable-write gate (cloud first, local SQL or disk
  when offline), with the browser copy kept only as an offline cache.
- Stock adjustments become a real report source: date, branch, item, before/after
  quantity, reason and who did it.

## Part 3 — Logs land in the right category

Today the category is re-derived from the wording of the action, so entries drift:
"Stock transfer approved" is filed under Payments because the word "transfer"
matches the payment rule, and page views, searches and modal opens flood every
filter.

Changes:

- The category the screen supplies wins. The wording rules are used only when a
  screen does not supply a valid one.
- Each screen is given an explicit, correct category: till and checkout → Sales,
  inventory, receiving, adjustments, transfers → Inventory, coupons, vouchers and
  promotions → Discounts & coupons, refunds/voids/cancellations → Returns &
  exchanges, shifts and sign-ins → Shifts & attendance, settings pages → Settings,
  staff, terminals and logins → Security & access.
- Navigation, search and modal noise is filed under a separate "Browsing" group and
  hidden from the trail by default (a toggle shows it).
- Both the stable key and the readable name are written to the database, so cloud
  reports group the same way the on-screen trail does.
- The audit screen gains a Module filter alongside Category, so on the Inventory
  module you can see only inventory activity, and historic rows are re-mapped on
  read.

## Technical notes

- `src/lib/audit-log.ts`: `resolveCategory` gives priority to the passed category;
  new `browse` group; DB push sends `action_category` (stable key) plus label.
- Call sites in `pos-store.tsx`, `routes/index.tsx`, `purchasing.tsx`,
  `receipts.tsx`, `TerminalTokens.tsx`, `AuditTracker.tsx`, `ticket-audit.ts`,
  `drawer-events.ts` updated to the correct category.
- `src/routes/audit.tsx` and `reports.activity.tsx`: module filter, browsing toggle,
  shared category list.
- New `src/lib/held-orders-db.ts`, `stock-adjustments.ts` DB paths wired into
  `sync-outbox`/`commitOps`; matching tables added to `electron/db/schema.sql` so
  the offline Windows database stays in step.
- The same schema is also applied to the Lovable-managed database as a migration so
  both backends match.