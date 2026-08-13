# POS Operations & Racket Hub + read-only service charge

## What the audit found

- The register is one big route, `src/routes/index.tsx` (~3.7k lines). Cart, payment deck, booking dialog and the canvas layout atoms all live there.
- Cart maths is `cartTotals()` in `src/lib/pos-store.tsx` (subtotal, line + bill discount, tax inclusive/exclusive, credit). It has **no service-charge concept at all**.
- The only "service charge" today is `serviceCharge` inside the racket booking dialog — a per-job fee added to the booking total, not a cart-wide charge. That stays.
- Booking hub already exists in part: `atom_actBooking` ("🏸 Create / Manage Booking") with a live badge of active jobs, a chooser between `bookMode` "cart" and "racket", and the `book.hub` action in `src/lib/register-actions.tsx`.
- Pay Later = bookings with `paymentTiming`, balances via `bookingBalance`, managed on `/bookings`. Hold tickets are separate: `src/lib/held-orders.ts` + `/holds`. Both stay untouched behaviourally.
- Racket / string "master data" is a plain string list in booking rules (`racketModels`, `stringModels` in `IntegrationSettings`), edited on `settings.booking-rules.tsx`. There is **no** brand/series/tension-range schema anywhere, and no racket rows in `products`.
- Settings pages exist for tax, printer, SQL/local database, layouts — reachable from the settings hub.

## Plan

### 1. Service charge in the money engine
- Add a `ServiceChargeSettings` block (`enabled`, `type: percent | fixed`, `value`, optional `taxable`) to app settings, defaulting to off so nothing changes for existing tills.
- Extend `cartTotals()` to return `serviceCharge` and fold it into `total`. Percent applies to the discounted net; fixed is a flat add. Default: the charge is taxable (added to net before tax) when tax is exclusive.
- Persist the charge amount on the sale so receipts and reports reconcile.

### 2. Read-only display
- Cart summary, checkout/payment panel, customer display and printed receipt show `Service charge (10%) $X.XX` as static text — no input, no click target, no clear button. It recalculates live from the cart.
- Cashiers have no path to change it at the register.

### 3. Admin-only configuration
- New "Service charge" section in POS settings (Tax/financials area), with type toggle, value input and enable switch, following the existing branch-aware settings frame so it can be global or per-branch.
- Editing is gated to admin/supervisor permission; other roles see the values read-only. Saving propagates through the existing settings sync, so live registers pick it up.

### 4. One hub button
- Rename/repurpose the existing permanent booking atom into `⚡ POS Operations & Racket Hub`, always visible, never disabled by an empty cart (only by a locked till).
- Badge shows three live counters: pending racket jobs, open bookings, unpaid pay-later tickets.
- Keeps working as a canvas node; `book.hub` action stays so hotkeys/custom buttons don't break.

### 5. Master hub modal (3 tabs)
- **Racket service** — the existing racket intake, upgraded: racket picker grouped by brand with model/series, string picker, mains/cross tension with a warning when outside the model's recommended range, stencil / overgrip / grommet toggles, ready-by date+time, auto job tag, auto-priced labour + string cost. Auto-fills the selected customer's last job.
- **Booking & pay later** — the standard booking flow (pickup date, slot, deposit) plus a Pay Later toggle for the current cart that links the customer, sets a due date, tracks the balance and prints the claim slip. Also links to the existing hold-ticket flow rather than replacing it.
- **Register & settings** — quick actions (close shift, open drawer, till reconciliation, daily sales summary) and an embedded admin service-charge editor; tax, printer, database and canvas layout open their existing settings pages.

### 6. Cart integration
- Racket jobs, bookings and pay-later tickets submitted from the hub land on the cart immediately as lines with metadata chips (`Yonex Astrox 99 | BG80 @ 26x28 lb | Ready Aug 15`, `Pay Later — due Aug 20`) and an `Edit specs` action.
- Order total breakdown shows subtotal, discount, service charge (read-only), tax, total.

## Technical notes

- Racket master data grows from `string[]` to `{ brand, model, series?, tensionMin?, tensionMax? }` with a migration that keeps existing plain-string entries working; edited on `settings.booking-rules.tsx`. Strings become `{ brand, model }`. Stored in `pos_settings.integration_settings`, so no schema migration.
- Rackets held as sellable stock in `products` are also offered in the picker, grouped under their brand, so real inventory shows up automatically.
- `cartTotals()` gains an optional service-charge argument; both existing call sites (`src/routes/index.tsx`, `src/lib/pos-store.tsx`) pass the effective settings. Sales gain a `serviceCharge` field mirrored to the `sales` row (one additive column).
- The hub is a new component under `src/components/pos/hub/` that receives the register's existing handlers, so no booking, hold, drawer or shift logic is duplicated or deleted — the current racket dialog moves into a tab.
- The existing per-job booking `serviceFee` is unchanged and stays distinct from the new cart-wide service charge.

## Not included

- SQL Server 2025 connection editing stays on its own settings screen (linked from the hub) rather than embedded, since it is Electron-only and unsafe to duplicate.
