# Total Rounding

## What I found first (current behaviour)

**Total calculation** — single path in `cartTotals()` (`src/lib/pos-store.tsx:2169`):
subtotal (price x qty) → line discounts → bill discount (amount or %) → `net` →
tax (inclusive pulls tax out of net; exclusive adds on top; per-line rates when no global tax) → `total`.
Returns `{ subtotal, discount, lineDiscount, billDiscount, tax, total, credit, net }`.
Checkout (`src/lib/register/use-checkout.ts`) consumes `totals.total` for tender validation, change, split-tender checks and the saved `Sale`.

**Settings storage** — one `AppSettings` object in the POS store, persisted as a single row (`id = 1`) in the `pos_settings` table via `buildSettingsRow`/`rowToSettings` in `src/lib/pos-db.ts`. Simple values are real columns; grouped blocks (`payment_details`, `whatsapp_settings`, `integration_settings`, `ui_visibility`, `qr`, `fonts`) are JSON columns. Settings pages are file routes (`src/routes/settings.*.tsx`) rendered inside `SettingsFrame` + `SettingsTabs`, editing through `useSettingsCtx().updateSettings`.

**Sale record** — `Sale` type in `src/lib/pos-types.ts`, mapped to the `sales` table by `saleToRow` (`src/lib/pos-db.ts:637`). Receipt HTML is built in `src/lib/pos-print.ts` (Subtotal / Discount / Coupon / Tax / Total / Change rows around lines 437-464).

## What I'll build

### 1. Settings
New `RoundingSettings` block stored inside the existing `integrations` JSON column — **no database migration for settings**:
`enabled`, `unit` (1 / 0.5 / 0.1 / 0.05 / 0.01), `direction` (nearest | up | down), `appliesTo` (all | cash), `showOnReceipt`, `receiptLabel` (default "Extra Discount").

UI: a new **"Billing & totals"** section at the bottom of **Settings → Tax & pricing** (`/settings/tax`), directly under the tax fields — that page already owns how the final total is formed. Only the "Enable total rounding" switch shows until it is on; the other five fields appear beneath it once enabled.

### 2. Calculation
New `src/lib/rounding.ts` with
`roundTotal(total, unit, direction) => { total: rounded, adjustment: rounded - original }`
(negative for round-down, positive for round-up), plus `applyRounding(total, settings, method)` that returns a zero adjustment when disabled, when unit is 0, or when `appliesTo = cash` and the tender is not cash.

It is applied **after** `cartTotals()` on the final total only — no line-item or tax change, and `cartTotals` itself is untouched, so the existing single calculation path stays the source of truth. Checkout computes the adjustment once, then uses the rounded total for: cash-tendered validation, split-tender balance, `change`, `paid` and the saved bill. Split tenders count as cash-only rounding when every tender (or the headline tender) is cash — I'll use the headline/first tender method, matching how `method` is already derived.

### 3. Transaction record + receipt
- `Sale` gains `roundingAdjustment?: number` and `roundingLabel?: string` (label snapshotted so reprints stay faithful). Always written, even when zero and even when hidden.
- Receipt (`pos-print.ts`, between the Tax row and the Total row): prints one line `<label>  -0.12` **only when** `showOnReceipt` is ON **and** `roundingAdjustment < 0`. Round-up or zero prints nothing, but the rounded Total is still what is printed and charged.
- Same rule applied to the WhatsApp bill body and the on-screen ticket total so screen, print and message agree.

### 4. Migration (required for the per-sale fields)
`sales` needs two new columns — `rounding_adjustment numeric(18,4) default 0` and `rounding_label text` — in three places:
- Lovable Cloud migration (Postgres) for `public.sales`
- `database/schema.sql` + `db/offline/pos-offline-sqlserver.sql` guarded `IF COL_LENGTH(...) IS NULL ALTER TABLE` statements
- `src/lib/central-schema.ts` sales column list (drift detection)

Settings need **no** migration (JSON block). The existing `unknownSettingsColumn` self-heal means an old till without the sale columns still saves the bill.

## Tests
Unit tests for `roundTotal` across all units/directions (including negative refund totals), the cash-only gate, and the receipt-visibility rule (shown only when adjustment < 0 and toggle on).

## Files touched
`src/lib/rounding.ts` (new), `src/lib/pos-types.ts`, `src/lib/pos-seed.ts`, `src/lib/pos-db.ts`, `src/lib/pos-print.ts`, `src/lib/whatsapp.ts`, `src/routes/settings.tax.tsx`, `src/lib/register/use-checkout.ts` (+ the register total display), `src/lib/central-schema.ts`, `database/schema.sql`, `db/offline/pos-offline-sqlserver.sql`, new test file, version bump.
