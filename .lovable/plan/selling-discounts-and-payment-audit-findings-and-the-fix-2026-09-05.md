# Selling, discounts and payment — audit findings and the fix

## What the audit found (existing code, verified)

**There is already one authoritative calculator.** `cartTotals()` in `src/lib/pos-store.tsx:2721` produces subtotal, line discount, bill discount, tax, net and total. Checkout, payment, the receipt, the saved sale and every report all read those numbers — nothing recalculates them later (`use-checkout.ts`, `receipt-template.ts`, `pos-db.ts`, `reports.*`). Final-total rounding runs once, in `src/core/pricing/rounding.ts`, on the number `cartTotals` produced. Money is rounded through the single `r2` helper. So the plan is to correct this pipeline, not replace it.

**Root causes of the reported problems:**

- **A — a second discount wipes the first.** A cart line has only one discount field (`discount` + `discountType`, `pos-types.ts:138`). An item coupon/promotion writes into that same field (`use-promotions.ts:100`), so when the cashier then opens the discount pad, `patchLine(target, { discount, discountType })` (`index.tsx:3476`) *replaces* the promotion instead of adding to it. A percentage typed there is also taken off the original price, never off the promoted price.
- **B — the pad opens on Amount.** Every default is `"amount"`: the cart state (`use-cart.ts:50`), each new line (`use-cart.ts:89`) and the pad's fallback (`index.tsx:3441`).
- **C — the same rule is written twice.** The bill discount is converted from percent to money in `index.tsx:490`, then converted *again* inside `cartTotals` (`pos-store.tsx:2730`) — the register works around this by passing the combined figure as an "amount". Two copies of one rule is why figures look inconsistent. Separately, a percentage line discount is rounded per unit and then multiplied by quantity, which drifts a cent on prices like 33.33 × 3.
- **D — prompts during a sale.** Discounts can raise two prompts back to back: the permission dialog (`pos-permissions.tsx:146`) and then the manager approval dialog (`index.tsx:3458`). The one-off unlock (`discountOverride`, `index.tsx:212`) is never cleared when the ticket is cleared, and the "stacking is off" case only shows a red toast with no explanation of what to do.
- **E — platforms.** Web, Android and Windows already run the *same* register screen and the same calculator; only connectivity and desktop-privilege wrappers differ. Nothing platform-specific needs new code.

**Security / integrity, as it stands:** the sale write is idempotent (`client_transaction_id`, with a real unique index on `sales` — verified), and the database refuses a discounted line from anyone without the discount right (`enforce_sale_permissions` / `enforce_sale_item_permissions`). What the database does *not* check is the size of the discount: the cashier ceiling and the manager approval are enforced in the screen only.

## The fix

### 1. Discounts that add up instead of replacing each other

Keep the existing fields. The line's `couponCode` / `couponDiscount` fields (already in the type and already saved) become the home for the promotion/coupon value, and `discount` / `discountType` stay as the cashier's own discount. Then:

- `lineUnitDiscount()` (the one shared helper) subtracts the promotion first, then applies the cashier's percentage to the already-reduced price — matching the worked example: 100 → 20% promo → 80 → 10% more → 72.
- Applying a manual discount no longer clears a promotion, and removing the coupon no longer clears the manual discount.
- The cart row shows both parts ("Promo 20% + 10%") so the cashier can see what is on the line.

### 2. Percent is the default

The discount pad opens on **Percent** everywhere (cart default, new line default, pad fallback). Amount stays available and unchanged; there is still one pad.

### 3. One conversion, one place

`cartTotals()` gains the promotion figure as an argument, so the register stops pre-converting the bill discount and simply passes `cartDiscount`, `cartDiscountType` and the promotion value. Percentage line discounts are worked out on the line's gross and rounded once, removing the per-unit drift.

### 4. Limits, validation and impossible totals

- A discount can never take a line or the bill below zero: the entry is capped with a clear message instead of producing a negative amount.
- Blank, 0, over 100%, negative, and an amount larger than the item are all refused in the pad with the reason shown.
- The cashier ceiling and manager approval keep working exactly as today; when stacking is switched off the cashier is told *why* and what to remove, instead of a bare error.
- The database learns the same ceiling: the existing sale triggers are extended so a line or bill discount above the branch limit is only accepted when the sale carries an approval stamp (`authorization_request_id`, already stored). One small migration, no new tables, no new rights, nothing loosened.

### 5. Fewer interruptions during a sale

- The discount unlock is asked once per ticket and cleared when the ticket is cleared or parked, so it neither nags nor lingers into the next customer's sale.
- Where a cashier holds the right already, no dialog appears at all — the double prompt (permission then approval) only happens when the discount is genuinely above the limit.
- The Pay action gets a hard re-entry guard so two fast taps cannot start two sales; the existing attempt id and the database's unique key stay as the backstop.

### 6. Tests

New cases against the existing calculator and helpers: no discount; 10/25/50/100%; fixed amount; promotion plus an extra discount; quantity 1/2/3 with a percentage; decimal prices; mixed discounted and plain lines; tax inclusive and exclusive; rounding on and off; cash change; discount larger than the price; negative and over-100 entries; switching percent ↔ amount. Plus the existing register, checkout and permission suites re-run.

## Technical notes

- Files expected to change: `src/core/types/pos-types.ts` (`lineUnitDiscount`), `src/lib/pos-store.tsx` (`cartTotals` signature), `src/routes/index.tsx` (pad wiring, defaults, unlock lifetime), `src/lib/register/use-cart.ts` (defaults), `src/lib/register/use-promotions.ts` (coupon writes `couponDiscount`, not `discount`), `src/lib/register/use-checkout.ts` (re-entry guard, totals call), `src/platforms/web/components/pos/DiscountPad.tsx` (validation messages), plus one migration for the discount-ceiling check and new tests under `src/lib/__tests__/`.
- `pos-db.ts` mapping stays as-is: `discount_percent` / `discount_amount` and `coupon_discount` already exist on `sale_items`, so no new columns.
- Not touched: Electron local backend and local SQL, cashier local authentication, terminal activation, Emergency Access, sync engine, reports (they read stored figures and stay correct once the stored figures are right).
- Version bumped at the end; the final report will list root causes, files changed, code reused, worked examples and the test results actually run.
