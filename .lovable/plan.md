# Register decomposition — remaining patches D, E, F

The Register screen (`src/routes/index.tsx`, ~3.8k lines) still holds three logic clusters inline. Patches A–C already moved cart, tender, booking/intake and checkout into `src/lib/register/*`. These next three follow the same pattern: extract state + handlers into a hook, keep JSX in the route, no behaviour change.

## Patch D — Promotions, coupons and vouchers

New hook `src/lib/register/use-promotions.ts`:
- Owns coupon dialog state (open, code, scope, target line), voucher token, member voucher list and picker state.
- Moves `applyCoupon`, `applyVoucher`, voucher-scan handling and the member-voucher loading effect.
- Keeps promotion evaluation (`evaluatePromotions`, FOC line derivation) available to the cart totals as it works today.
- Route keeps the dialogs and buttons, driven by the hook's returned values.

## Patch E — Exchange and refund

New hook `src/lib/register/use-exchange.ts`:
- Owns exchange dialog state, bill lookup, selected-item picks, `exchangeRef`, credit-line creation and the refund-due calculation.
- Keeps the shift-open guard and permission check (`can_process_refund`) exactly as-is.

## Patch F — Held orders

New hook `src/lib/register/use-held-orders.ts`:
- Owns `holdOrder`, `resumeOrder`, held-order list state and the park-current-ticket behaviour when switching tickets.
- Continues to write/read the same draft and hold payload shape so in-flight tickets in local storage stay compatible.

## Technical notes

- Each hook receives a typed deps object (setters for lines/member/discount/billNo, `state`, `logger`, permission helpers) mirroring `CheckoutDeps`, so the route stays the single owner of ticket state.
- Use `import type` across register hooks to avoid the circular-runtime issue hit in Patch C.
- Draft persistence keys, coupon payload fields and hold record shape are unchanged.
- After each patch: typecheck, production build, and the existing test suite (148 tests) must pass; version bump at the end (1.3.20).

## Out of scope

No UI redesign, no new features, no backend or RLS changes.
