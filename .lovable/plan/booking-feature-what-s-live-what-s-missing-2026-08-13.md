# Booking feature: what's live, what's missing

## Audit result

The booking / racket-intake work is in the code and shipped. Verified in the repo:

- Bookings page (`src/routes/bookings.tsx`): status tabs (active / collected / cancelled / all), job-card filters (received / strung / ready / collected), search by ref, customer, phone, racket model, string type; actions for Print slip, Job tag, Part payment, Collect, Cancel with reason, Delete job with a typed reason.
- Register dialog (`src/routes/index.tsx`): the "Book & pay later" vs "Racket / stringing booking" split is real (`bookMode`), with the full job card — racket model, string type, tension mains/crosses with lb/kg, ready-by, grommet/grip notes, job notes, notify-on-WhatsApp.
- Printing (`src/lib/pos-print.ts`): booking slip with job block, terms block, signature block, part-payment receipt (with optional repeated terms), and a separate racket job tag.
- Settings (`src/routes/settings.booking-slip.tsx`): terms text, print-terms toggle, signature toggle and caption, terms-on-payment toggle, live preview — linked from the settings index.
- Storage (`src/lib/bookings-db.ts`): bookings and payments saved by upsert, with an offline queue fallback.

So nothing major is missing from the code. Three real gaps remain, plus one likely reason the web app looks out of date.

## Why the web app may look behind

1. The version stamp shown in the app is stale: `src/version.ts` still says 1.2.105 while `package.json` is 1.2.107. The version banner therefore reads old even when the code is current.
2. The Bookings entry only appears for staff whose role carries the `can_manage_bookings` flag. Roles without it never see the menu item.

Both are checked and corrected as step 1 below.

## Changes

### 1. Version + visibility check
- Regenerate `src/version.ts` so the in-app version matches `package.json` (1.2.108 after this change).
- Confirm the signed-in role actually has `can_manage_bookings`; if the default cashier/manager roles lack it, add it to their defaults in `src/lib/permissions.ts` so the Bookings page is reachable.

### 2. Itemised racket intake charges (currently unused)
`src/lib/booking-charges.ts` exists but nothing imports it — the racket dialog still has a single flat "Stringing fee" box.
- Wire the racket dialog to build a charge list (labour, string, grip, add-ons) using the existing helpers, writing to the booking's `charges` field.
- Show the charge lines and running total in the dialog, on the bookings card, and on the printed slip.

### 3. Per-action booking permissions
Today collect/part-payment reuses "process sale" and cancel/delete reuses "void item".
- Add `can_create_booking`, `can_collect_booking`, `can_cancel_booking` to `src/lib/permissions.ts` with labels and role defaults.
- Gate the register booking buttons and the bookings-page actions on the new flags, keeping `can_manage_bookings` for page visibility.

## Technical notes

- `src/routes/index.tsx`: replace the flat `serviceFee` input in racket mode with charge rows fed by `intakeTotals`/`mapCharge` from `src/lib/booking-charges.ts`; include `charges` in the booking payload (the `bookings.charges` column already exists).
- `src/lib/pos-print.ts`: render charge lines inside `jobCardBlock`/`bookingBody` when present, falling back to the flat fee for older bookings.
- `src/lib/permissions.ts`: three new flag keys plus descriptions and role defaults; `src/routes/bookings.tsx` and `src/routes/index.tsx` swap `can_process_sale` / `can_void_item` checks for the new ones.
- No database migration needed — every column used is already in the schema.
