# Cashier Security, Blind Shift Balancing & Profit Analytics

Builds on what already exists — the register, product catalogue, shift close dialog, audit page and reports keep their current layout and routes. No redesign.

## 1. Cashier audit logging engine

Today the till already records ticket voids and no-sale drawer opens locally, but they land in the general activity log alongside routine browsing, and price/discount overrides on a line are not captured at all.

- Add one small module that records three cashier-risk actions in a single consistent shape: timestamp, cashier ID and name, action type (`item_void`, `price_override`, `no_sale`), item details (name, SKU, quantity), and value (money impact).
- Hook it into the existing handlers: removing or zeroing a cart line, changing a line's price/discount away from the catalogue price, clearing/voiding a ticket, and the no-sale drawer open.
- Each event is written to the immutable cloud audit table (the one that already blocks edits and deletes) and mirrored to the terminal's local log so it still records offline and syncs later.
- Add a **Cashier Audit Trail** tab to the existing `/audit` page (manager/admin only, gated by the current permission system): filterable by date range, cashier, action type and free-text search, with a CSV export using the existing export helper.

## 2. Blind shift reconciliation

The close dialog already hides expected figures when blind mode is on, but only asks for cash.

- Extend the close form to three counted boxes: **cash (required)**, **card** and **digital/wallet** (optional — blank means "not counted").
- While blind mode is on, no expected total, variance preview or tender breakdown is shown until the counts are submitted.
- On submit compute, per tender and in total: `Over/Short = Counted − (Opening float + Net shift sales for that tender)`. Cash keeps the existing opening-float rule; card and digital compare against sales only.
- Store the full breakdown on the shift record and show it on the shift history page: variance in green when over, red when short, neutral when square. Existing manager-PIN gate on large variances continues to apply, now against the combined variance.
- The current "no count = no close" failsafe stays.

## 3. Real-time profit & COGS analytics

Products already carry a cost price and sale lines already capture the cost at the moment of sale; per your answer this is reused as the wholesale cost — no new field.

- Add one shared profit helper so every screen computes gross profit the same way: `(selling price − cost) × quantity`, with returns/exchanges subtracting and free-of-charge lines counted as pure cost.
- Add three metrics to the existing dashboard: **Gross Revenue**, **Total COGS**, **Gross Margin %** — placed in the current KPI row, same card style.
- Add an **hourly profit** chart next to the existing hourly transactions chart, using the same chart library and theming: revenue vs profit by hour for the selected day.
- The Business report reuses the same helper so its margin figures can never drift from the dashboard's.

## Technical notes

- New `src/lib/cashier-audit.ts` (event shape + recorder) writing through the existing system-audit server function; new `src/lib/profit.ts` for the shared margin maths; shift maths extended in `src/lib/shift-close.ts`.
- Shift record gains counted card/digital and per-tender variance fields — a small additive migration on the shifts table, no changes to existing columns.
- No changes to the products table, routing, or the register layout engine.
