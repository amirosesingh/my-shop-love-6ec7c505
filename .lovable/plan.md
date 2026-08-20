# Part 6 — Step 1 continued: Register decomposition

The ticket state already moved into `src/lib/register/use-cart.ts` and the till behaved identically (typecheck clean, 148 tests green). `src/routes/index.tsx` is now 4075 lines and still holds tender, booking/racket intake, checkout orchestration and receipt/print triggers in one component. Next patches move those out the same mechanical way — code is relocated verbatim, no business rules touched, suite run after each patch.

## Patch A — Tender

New `src/lib/register/use-tender.ts` holding the payment-entry state currently in the route: method, tendered amount, transfer reference, tender reference and note, split-bill fields, and the pay dialog open state. Handlers (fast cash, method switching, split recompute) move with it. The route consumes the hook and renders the same JSX.

## Patch B — Booking and racket intake

New `src/lib/register/use-booking-intake.ts` for the booking dialog and racket job-card fields: customer name/phone/note, deposit and deposit method, due date, pay timing, service selection, racket model, string type, tensions, grommet/job notes, promised date, stencil/overgrip, job tag, intake charges, liability acknowledgement, labour unlock and its reason, and the booking hub/edit state. Validation and the liability gate travel unchanged with their handlers.

## Patch C — Checkout orchestration

New `src/lib/register/use-checkout.ts` wrapping the charge/commit flow: the saving flag, permission and shift gates, the call into the existing `pos-db` checkout (batch stock deltas from Part 5 unchanged), exchange handling and post-sale cleanup. No change to idempotency, payment or stock behaviour.

## Patch D — Receipt and print triggers

New `src/lib/register/use-receipt.ts` for last-sale state, receipt preview, reprint, drawer eject and the WhatsApp send fields. Hardware stays gated behind a committed sale exactly as today.

## After the four patches

- Re-run `bunx vitest run` after each patch; keep a patch only if sales, payments, stock, sync, permissions, printing, offline mode and branch isolation are all green.
- Expected result: `src/routes/index.tsx` down to roughly composition plus JSX, with each concern in its own file under `src/lib/register/`.
- Steps 5 (audit/sync module review), 6 (index analysis, report only) and 7 (`purchasing.tsx`, `electron/main.cjs`, `pos-print.ts`) follow once the register work is stable.

## Technical notes

- Hooks are plain state containers taking a small `deps` object, matching the shape already used by `use-cart.ts`.
- No file moves for layout: `register-layout.ts` stays where it is and the route keeps consuming it.
- No persisted-state schema change in this step; `pos-state-v2` stays byte-compatible.
