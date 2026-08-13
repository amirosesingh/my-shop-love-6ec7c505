# Booking overhaul: one entry point, universal customer lookup, full racket service flow

Audit of the current register found the booking system is ~70% there: a "Create / Manage Booking" hub button with a live badge, a dual-flow chooser modal, itemised intake charges, tension fields, promised date/time, job tags and a barcode job ticket already exist. The gaps below are what is still missing or duplicated.

## 1. Strict single entry point

Today there are three booking triggers: the hub button (`actBooking`), a second "Book & pay later" button (`actBookLater`, rendered in the bill footer and offered in the layout palette / custom-button action list), and a "Racket booking" shortcut inside the products panel.

- Remove the `actBookLater` module (atom, bill-footer slot, default layout entry, palette module, `book.later` action id).
- Stop passing `onRacketBooking` to the products panel so that shortcut disappears.
- Rename the remaining button to exactly **"Manage Booking"** (keeps the active-bookings badge) and the modal title to match.

## 2. Universal customer lookup inside the booking modal

Replace the plain Customer name / Phone inputs with a search field over the existing member data:

- One input matching name OR phone; results list shows name, phone, member code and tier.
- Selecting a member attaches them to the ticket and fills name, phone, member id and tier chip.
- Inline "+ Quick Add Customer" opens the existing quick-member dialog and returns to the form with state intact.
- Free-typed walk-in name/phone still allowed when no member matches.

## 3. Workflow A — Standard / general booking (pay later)

Already guarded: saving with an empty cart is blocked. Only the copy changes to the requested wording: *"Please add at least one item to the cart before saving a pay-later booking."* The save button is additionally disabled (not just toast-blocked) while the cart is empty.

## 4. Workflow B — Racket service & stringing

Extend the existing racket intake section:

- **Racket source:** searchable picker over the product catalogue plus the curated racket master list, and a "Customer provided racket" toggle that forces the racket line to 0.00.
- **String source:** same picker over catalogue string products plus the string master list, and a "Customer provided string" toggle forcing that charge to 0.00 (stored as the existing `stringOrigin` field).
- **Add-ons:** a picker that appends catalogue items (grips, grommets, stencil work) as charge lines at their catalogue price, on top of the manual "+ Add charge" rows.
- **Inspection notes:** promote the existing notes field to a textarea labelled "Racket inspection / pre-existing condition".
- **Locked labour fee:** the labour charge row becomes read-only, pre-filled from the configured base labour fee / stringing service fee. An "Override / waive charge" button unlocks it and requires either a supervisor PIN (existing manager gate) or a mandatory discount reason, which is stored on the charge line and printed on the slip.
- **Combo rule:** when both a catalogue racket and a catalogue string are on the job, apply the configured combo behaviour (waive labour or apply the configured discount) automatically, shown as a visible line on the charge summary.
- **Save actions:** keep "Pay later on pickup" and add a "Pay now" action that saves the booking and routes straight into the existing checkout deck.
- **Job ticket:** add a QR code of the job reference next to the existing Code 39 barcode on the printed claim tag.

## 5. Settings

The base labour fee, stringing service list, racket/string master lists and booking rules already exist in Settings → Booking rules. Two new fields get added there:

- Combo rule: off / waive labour / percent discount / flat discount, with its value.
- Whether an override of the locked labour fee requires a supervisor PIN or just a written reason.

No new database tables: bookings already persist charges, string origin, tension, notes, tag and job status.

## Technical notes

- All register work stays in `src/routes/index.tsx` (booking dialog + atoms), with shared helpers in `src/lib/booking-charges.ts` for combo maths.
- Entry-point cleanup touches `src/lib/register-modules.ts`, `src/lib/register-layout.ts`, `src/lib/register-actions.tsx` and `src/components/pos/CatalogPanel.tsx` usage.
- New settings fields extend `IntegrationSettings.bookingRules` in `src/lib/pos-types.ts` and the form in `src/routes/settings.booking-rules.tsx`.
- The QR helper (`qrSvg`) already exists in `src/lib/pos-print.ts` and is reused for the job tag.
