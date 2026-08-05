# Split "Book & pay later" from "Racket booking"

Today both buttons open the same dialog. "Book & pay later" still shows the racket / stringing job card and can pick a stringing service, so the two flows overlap.

## What changes

**Book & pay later (cart booking)**
- No racket / stringing job card section at all.
- The service picker lists only non-stringing services (repairs, custom orders, typed-in job when allowed).
- Requires at least one cart line again — the empty-cart exception belongs to racket bookings only, so the button is disabled with an empty cart.
- Wording stays about reserving goods and settling later.

**Racket booking (from the products card)**
- Opens its own dialog: job card always expanded, stringing service preselected, no goods service picker.
- Works with an empty cart whenever a shift is open, as now.
- Saves with the job block and prints the booking slip plus the job tag.

Both dialogs keep the shared payment timing, deposit, collect-by date, customer name/phone and note fields.

## Technical notes

- `src/routes/index.tsx`: add a `bookMode: "cart" | "racket"` state set by each entry point. Gate the job-card block on `bookMode === "racket"` (always expanded, no toggle) and the service picker on `bookMode === "cart"` with `serviceTypes.filter(s => !s.isStringingJob)`.
- `bookAndPayLater`: require `lines.length` when `bookMode === "cart"`; attach `job` only in racket mode; keep the stringing service selected in racket mode.
- Deck button: `disabled={tillLocked || refundDue > 0 || !lines.length}` (drop `bookingNeedsNoCart`).
- Dialog title switches between "Book & pay later" and "Racket / stringing booking".
- Reset job-card fields when a racket booking closes so a later cart booking can't inherit them.