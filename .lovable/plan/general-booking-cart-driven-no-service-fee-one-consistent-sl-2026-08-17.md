# General booking: cart-driven, no service fee, one consistent slip

## What changes for the cashier

**Book & pay later (general booking)** becomes purely a goods booking:

- No service picker, no "service fee" box. The booking total is just the cart items (with tax as configured).
- The booked items are listed inside the booking dialog itself — name, qty, unit price, line total — so what is being reserved is visible before saving.
- A small scan/search bar sits above that list: scan a barcode or type a code/name and the item is added to the ticket without leaving the booking window. Qty +/- and remove work in the same list.
- Saving still requires at least one item and a customer, and the deposit/balance breakdown stays as it is today.
- Terms & conditions text plus the mandatory acceptance tick stay, and the customer signature block is required on the printed slip.

**Racket / stringing service** keeps the service fee and job charges exactly as they are today — that is the only flow where a fee is entered by hand.

**The slip** is one shared layout for both flows so there is no variation:

- Header, booking reference, date, branch, cashier
- Customer name / phone (and member code where attached)
- Item lines with qty and price (general booking) and/or the job block (racket)
- Subtotal, tax, total, paid now, balance on collection, collect-by date
- Terms & conditions, then the signature rule with the customer name and date
Racket slips additionally show the job block; nothing else differs.

## Technical notes

- `src/routes/index.tsx`: drop `serviceId` / `customService` / `serviceFee` from the general branch (keep them only for the racket path); `serviceCharge` becomes racket-only, so `bookingTotal = totals.total` for general bookings. Add a booking-dialog cart panel that reuses `scanCode` and `ProductSearchDialog` and the existing `lines` state, so what is in the dialog and what is on the register ticket are the same list.
- Extract the general-booking body into `src/components/pos/booking/GeneralBookingPanel.tsx` to keep `index.tsx` from growing further; the racket intake stays where it is.
- `src/lib/pos-print.ts`: make `bookingBody` render item rows and the job block from one template, always emit `termsBlock()` and `signatureBlock()` for general bookings (not gated behind the racket-only path), and keep `jobCardBlock` empty when there is no job. No change to `escpos.ts`.
- `src/lib/bookings-db.ts` / `pos-types.ts`: `serviceFee`, `serviceName` become optional and are simply not set for general bookings; no migration needed.
- Booking rules: general-booking terms keep coming from `bookingRules.serviceTerms`; acceptance stays enforced in `bookAndPayLater`.

## Final deliverable: audit report

After the changes, a full read-through of the codebase produces `docs/system-audit.md` covering:

- Broken or dead links: routes referenced by nav/links that no longer exist, redirect-only routes, orphaned files
- Unfinished logic: unhandled promises, `TODO`/stub paths, swallowed errors in financial, stock, booking, coupon and sync code
- Data flow gaps: fields written but never read, DB columns with no UI, UI fields never persisted
- Permission/RLS gaps on booking, payment and stock paths
- Print paths: which slips exist, which settings actually affect them
- A prioritised fix list (blocking / should-fix / nice-to-have)

Verification alongside it: typecheck, the existing vitest suite, and a browser pass through the register — scan an item, open Book & pay later, add an item from inside the dialog, take a deposit, save, and confirm the printed slip content.
