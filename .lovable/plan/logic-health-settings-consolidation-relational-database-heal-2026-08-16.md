# Logic Health, Settings Consolidation & Relational Database Health

Three additions, all built with the existing settings frame, cards, badges and table styles.

## 1. Logic Health Dashboard

A new page at `/settings/logic-health` (listed under "Data & sync" in the settings hub) that renders a static analysis report of the app itself.

- A build-time scan script walks `src/` and produces a JSON report of:
  - **Placeholders / incomplete logic** — `TODO`, `FIXME`, `not implemented`, empty function bodies, functions that return a hardcoded/mocked value.
  - **Dead UI connections** — `onClick`/`onSubmit` handlers that are empty, `() => {}`, or only `console.log`; forms with no submit handler; buttons with no action.
  - **Missing guards** — `await` calls in money/stock paths (checkout, discount apply, stock adjust, payment retry, shift close) that are not inside a `try/catch`; numeric inputs parsed without validation.
- The report is committed as generated data (`src/lib/logic-health.report.json`) plus a small runtime module so the dashboard loads instantly offline.
- UI: severity groups **Critical / Warning / Info**, each row showing file path, line, rule name and a one-line plain-English explanation; counters at the top; a filter box; "Copy report".
- Severity mapping: money/stock/auth paths → Critical; user-visible dead actions → Warning; TODOs and cosmetic gaps → Info.

The first run of the scanner produces the actual findings list — no flaws are asserted before it runs.

## 2. Settings Consolidation

The hub currently opens 30+ separate pages, several covering one domain. Consolidate into unified parents with sub-tabs, keeping every existing panel component untouched and simply re-hosting it in a tab.

- **POS Rules** (`/settings/rules`) — sub-tabs: Rules & enforcement (existing groups), Tax & pricing, Bill numbering, SKU numbering, Cashier & session limits (idle timeout, already here).
- **Receipts** (`/settings/printer`) — sub-tabs: Printer, Elements, Typography, Extra lines, QR, Booking slip.
- **Booking Rules** (`/settings/booking-rules`) — sub-tabs: Booking rules, Services & fees, Booking slip wording (shared with Receipts, one source).
- **System & General** (`/settings/system`) — sub-tabs: System status, Database health, Security alerts, Data sync & audit, Settings inheritance.
- The old routes stay as thin redirects to `parent?tab=<id>` so existing links, the search box and the legacy `?section=` redirect keep working.
- The hub grid collapses to the unified parents; sub-tab names remain searchable in the settings search.
- A "Duplicate settings" check in the Logic Health report flags any future page that re-declares a field key already owned by another panel.

## 3. Database Health — Operational Relational Checker

Extends the existing Database health page with a second section, above the current read/write probe.

- **Scope:** operational tables only — `sales`, `sale_items`, `bookings`, `booking_payments`, `payment_transactions`, `products`, `product_barcodes`, `product_categories`, `members`, `membership_tiers`, `purchase_orders`, `purchase_order_items`, `stock_transfers`, `stock_transfer_items`, `promotions`, `coupon_campaigns`, `issued_vouchers`, `stock_adjustments`. Authentication/identity tables (`app_users`, `user_roles`, `staff_roles`, `cashiers`, `pin_attempts`, `terminal_tokens`, sessions) are excluded by an explicit deny-list.
- **Checks per table:** declared foreign keys read from the catalog, and an orphan count per relationship (child rows whose parent id no longer exists).
- **Status badge:** green "Connected & healthy" (FKs present, 0 orphans), yellow "Disconnected / missing FK" (expected relation not declared), red "Integrity risk" (orphans found, with the count and the pair involved).
- **Flow diagram:** a lightweight SVG/CSS graph of the operational tables and their edges, edges coloured by status — no new charting dependency.
- **"Run full system health & logic scan"** button at the top of the page: runs the relational check, the existing read/write probe, the settings duplication check and reloads the logic report, then shows one consolidated summary with counts per area and a copyable text report.

## Technical notes

- Relational data comes from a new security-definer database function `operational_relational_health()` that reads `information_schema`/`pg_constraint` for declared FKs and runs bounded orphan counts for a fixed allow-list of table pairs, returning JSON. Added via a migration; execute granted to authenticated only. The page calls it through the existing routed database access, so nothing new bypasses the relay.
- The expected-relationship map lives beside the deny-list in `src/lib/db-relations.ts` so "missing FK" is judged against the intended model, not just what exists.
- Logic scanner is a Node script under `scripts/` run manually and in CI; the dashboard reads the generated JSON, so no parsing happens in the browser or the Worker.
- Settings sub-tabs use the existing `SettingsFrame` plus a tab strip; panel components move by import only, no logic rewrite.
- Route redirects are `beforeLoad` throws, matching the pattern already used for `?section=`.
