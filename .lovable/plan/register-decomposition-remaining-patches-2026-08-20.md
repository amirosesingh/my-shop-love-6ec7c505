# Register decomposition — remaining patches

The Register route (`src/routes/index.tsx`, ~4,082 lines) is being decomposed into focused hooks under `src/lib/register/`. So far:

- **Patch A — Tender**: DONE → `src/lib/register/use-tender.ts`
- **Patch B — Booking / Racket Intake**: DONE → `src/lib/register/use-booking-intake.ts`
- **Patch C — Checkout**: NOT DONE (next)
- **Patch D — Coupon / Voucher / Promotion**: NOT DONE
- **Patch E — Exchange & Refund**: NOT DONE
- **Patch F — Held Orders**: NOT DONE

## Patch C — Checkout orchestration

Extract the sale/booking completion flow into `src/lib/register/use-checkout.ts`.

Scope:

- `completeSale()` (lines ~1164–1333) including:
  - validation (shift, lines, tender reference, points balance)
  - building `Payment[]` from single or split tender
  - `recordSale()` call, error handling, `saving` flag
  - voucher redemption, cash-drawer open, audit logging
  - receipt print, WhatsApp auto-send, customer display publish
  - cart reset + tender reset + success toast
- `bookAndPayLater()` (lines ~982+) and related booking-commit helpers
- `lastSale` state and derived receipt/print actions
- The `registerActionHandlers` `cart.charge`, `cart.fastCash` wiring stays in the route but delegates to the hook.

Dependency injection pattern (same as Tender): the hook accepts a `deps` object with getters for `lines`, `totals`, `member`, `activeShift`, `activeCashier`, `exchangeRef`, `coupon`, `voucherToken`, `pointsEarned`, and callbacks such as `resetCart`, `resetTender`, `setMemberId`, `setVoucherToken`, `setLastSale`, `setWaNumber`.

Result: `src/routes/index.tsx` loses the large `completeSale`/`bookAndPayLater` blocks and the `saving`/`lastSale` state; the route becomes layout + dialog wiring.

## Patch D — Coupon / Voucher / Promotion

Extract promotion application into `src/lib/register/use-promotions.ts`.

Scope:

- `applyCoupon()`, `applyVoucher()`, `voucherPreview()`, `removeCoupon()`
- Coupon dialog state: `couponOpen`, `couponCode`, `couponScope`, `couponLine`
- Voucher token state: `voucherToken`
- Member voucher loading (`memberVouchers`, `voucherPickerOpen`)
- Discount override / `unlockDiscounts()` helper

Dependencies: `lines`, `setLines`, `setCartDiscount`, `setCartDiscountType`, `setCoupon`, `member`, `state.members`, `state.products`, `state.promotions`, `promoBase`, `requirePermission`, `canDiscount`.

Result: the route no longer owns coupon/voucher logic; the promotion hook returns `applyCoupon`, `applyVoucher`, `removeCoupon`, `voucherPreview`, and dialog state binders.

## Patch E — Exchange & Refund

Extract exchange workflow into `src/lib/register/use-exchange.ts`.

Scope:

- `exchangeOpen`, `billQuery`, `billHit`, `picks` state
- `lookupBill()`, `addExchangeCredits()`
- Exchange-related validations and credit-line generation

Result: exchange becomes a self-contained hook consumed by the route and the exchange dialog.

## Patch F — Held Orders

Extract held-order management into `src/lib/register/use-held-orders.ts`.

Scope:

- `holdOrder()`, `resumeHeld()`
- Route `?resume=<id>` navigation effect
- Integration with the existing `useHeldOrders` global store

Result: the route only renders the held list and calls `holdOrder`/`resumeHeld` from the hook.

## Recommended order

1. Patch C — checkout (biggest reduction, touches core sale path)
2. Patch D — promotions (large independent block)
3. Patch E — exchange (smaller, isolated)
4. Patch F — held orders (smallest, finishes decomposition)

## Validation

After each patch:

- `bunx vitest run` (148 tests)
- `tsgo` / typecheck
- Manual smoke through the preview: add item, apply coupon, charge, split tender, complete sale, hold/resume, exchange, book-and-pay-later.

## Outcome target

Bring `src/routes/index.tsx` under ~2,500 lines by moving stateful logic into named, testable hooks, leaving the route as the composition layer for workspace slots and dialogs.
