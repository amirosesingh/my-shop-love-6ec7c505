# Full racket booking slip with terms and a signature line

## What changes on the printed slip

The booking / pay-later slip gets a complete job block instead of the short one it prints today. When a booking has a racket job it shows:

- Service name and payment timing (pay now / deposit / on collection)
- Racket model, string type
- Tension: mains / crosses with the unit, printed bold
- Grommet / grip notes and job notes in full, wrapped
- Dropped off at, ready by, current job status
- Collect-and-settle-by date and balance due (as now)
- WhatsApp-notify flag when the customer asked to be messaged

Below that, two new sections you control:

1. **Terms & conditions** — free text you write yourself in settings (liability for old frames, collection window, uncollected-racket policy, anything else). Printed in small type under the job details.
2. **Customer signature** — an optional block with a signature rule, the customer name under it and a date line, so one slip carries the job details, the terms and the signature together.

The racket job tag stays short: no terms, no signature.

## What you can manage

A new **Booking slip** settings page in the receipt settings group with:

- Terms & conditions text area (multi-line, printed as written)
- Toggle: print terms on booking slips
- Toggle: print customer signature block
- Signature caption text (default: "I accept the terms above and confirm the racket details are correct.")
- Toggle: also print terms on the part-payment receipt
- Live preview through the existing settings preview panel

Values save with the rest of the receipt settings, so they sync to every till, and branches can override them like other receipt fields.

## Technical notes

- `src/lib/pos-types.ts`: extend `ReceiptSettings` with `bookingTerms: string`, `showBookingTerms: boolean`, `showSignature: boolean`, `signatureCaption: string`, `termsOnPayment: boolean`; add the same keys to `ReceiptOverride`; add defaults wherever receipt settings are seeded/normalised.
- `src/lib/pos-print.ts`: expand `jobCardBlock` to cover every `RacketJob` field plus `serviceName`, `paymentTiming`, `droppedOffAt` and `notifyWhatsApp`; add `termsBlock()` and `signatureBlock(name)` helpers, rendered in `bookingBody` and, when `termsOnPayment`, in `bookingPaymentBody`. The signature rule is plain divs/hr, so the ESC/POS renderer in `src/lib/escpos.ts` needs no change.
- New route `src/routes/settings.booking-slip.tsx` built on `SettingsFrame` (`branchAware`, `showPreview`) with `useSettingsCtx().setField`, mirroring `settings.lines.tsx`; link it from the receipt group in `src/routes/settings.index.tsx`.
- Persistence: confirm whether receipt settings round-trip through a JSON column or discrete columns in `pos_settings` before coding; add a migration for the new fields only if they need real columns.
- No changes to booking capture or the durable commit flow.