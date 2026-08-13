# Booking hub: one button, two flows, cart-visible jobs

## Audit result (what is actually there)

There is no `src/components/booking/` or `racket/` folder — the whole booking UI lives inline in `src/routes/index.tsx` (register). It is rendered, not detached, but it is hard to reach:

- The racket / stringing entry is a small button inside `CatalogPanel` (products card), only shown when the register passes `onRacketBooking`.
- "Book & pay later" is a deck atom that is **disabled whenever the cart is empty** (`disabled={... || !lines.length}`), so on a fresh screen it looks dead.
- Both open the same dialog, switched by `bookMode` ("cart" vs "racket").
- On the customisable canvas, either control can be left off the layout entirely, so a till can end up with no booking entry at all.

State/persistence is fine: `RacketJob`, `IntakeCharge`, `charges`, `tagId`, `promisedAt` all exist in `pos-types.ts`, `pos-store.tsx` saves them, and the `bookings` table has matching columns. Nothing is lost between dialog and save.

Real gaps versus the request:
- No single permanent "Create / Manage Booking" button, no pending-booking badge.
- No flow-chooser modal — the flow is decided by which button you press.
- Racket brand/model and string are plain text inputs; no searchable master list, no auto-fill from the active customer's previous racket.
- No stencil / overgrip toggles (only a free-text note).
- `newJobTag()` exists in `booking-charges.ts` but the register never calls it, so `tagId` is usually blank.
- A submitted booking never appears on the cart; it goes straight to the bookings ledger, so there are no metadata chips and no "Edit specs".

## Changes

### 1. One permanent booking button (right panel)
- New always-visible primary button `Create / Manage Booking` in the cart/payment column, never disabled by an empty cart (only by a closed shift, with the usual locked reason).
- Live badge showing the count of today's active bookings (received / strung / ready) for this branch.
- Registered as a canvas action so it can be placed on custom layouts, and included in the default layout.
- Keep the existing entry points working; they just preselect a flow.

### 2. Flow-chooser modal
Clicking the button opens a chooser with two cards:
- **Racket service & specs** — always available.
- **Standard / general booking** — needs cart lines or lets you pick inventory inside the dialog.
Plus a "Manage bookings" link to `/bookings`.

### 3. Racket flow upgrades
- Searchable racket brand/model picker (combobox) backed by a master list in booking settings, with free text still allowed.
- Searchable string brand/model picker (BG65, BG80, Aerobite …), same fallback.
- Auto-fill last used racket, string and tensions when a member is selected on the register.
- Mains / cross tension inputs stay, default unit lb.
- Stencil toggle and overgrip-replacement option (writes into the job card and the charge list when the grip is chargeable).
- Ready-by date/time picker (already present) kept, plus a job tag generated automatically via `newJobTag()` and printed on the tag/slip.

### 4. Standard flow
- Requires cart lines, or opens the existing product search to add items from within the booking view.
- Pickup date/time and deposit as today, printing the reservation slip.

### 5. Booking appears on the cart
- On submit, the booking is pushed onto the cart summary as a service line (fee/deposit priced), tagged as a booking line.
- Metadata chips on the row: `Yonex Astrox 99 · BG80 @ 26x28 lb · ready Fri 3pm`.
- `Edit specs` action on that row reopens the racket dialog for the same booking and updates tension / string / ready-by before payment.

## Technical notes

- `src/routes/index.tsx`: add `bookingHubOpen` state and an `atom_actBooking` button (badge from a bookings query filtered on active job statuses); the chooser sets `bookMode` then opens the existing dialog. Racket dialog gains combobox pickers, stencil/overgrip toggles and `tagId` from `newJobTag()`.
- Master lists (racket models, string models) stored in `pos_settings.integrations` alongside `serviceTypes`, edited on `src/routes/settings.booking-slip.tsx` — no migration needed.
- Cart line: extend `CartLine` with an optional booking marker so the row renders chips and the `Edit specs` button; existing sale maths unaffected because the line is priced at the deposit/fee.
- `src/lib/register-actions.tsx`: add a `book.hub` action so the canvas palette can place the new button.
- `src/lib/pos-print.ts`: print the job tag id and stencil/overgrip flags on the racket tag.
- Auto-fill reads the member's most recent booking through the existing bookings loader; no schema change.