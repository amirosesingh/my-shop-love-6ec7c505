# Racket Service & Booking — Phase 2 to 4

Phase 1 (liability terms, high-tension flag, print integration) is done. This continues with the remaining specification items.

## Phase 2 — Dedicated booking workspaces

Today both booking flows run inside a dialog on the register screen. Give each its own full page, reachable from the same single "Manage Booking" chooser (no new entry points):

- `/pos/general-booking` — pay-later booking: customer search and quick-add on the left, catalogue search and line list in the middle, totals, deposit and due date on the right. Saving is blocked until at least one item is on the ticket (cart guard) and a customer is attached.
- `/pos/racket-service` — spacious three-column intake: customer, racket plus string/grip specs (catalogue-linked with "customer provided" toggles), and charges/terms/summary. Keeps the Phase 1 liability box, high-tension amber warning and read-only labour pricing.
- The existing dialog becomes the chooser only; both buttons navigate to these pages, and each page returns to the register after saving and printing.
- Customer-provided string still checks stock: when a store product is chosen, an inventory guard warns on zero stock and requires a manager PIN plus a typed reason to continue.

## Phase 3 — Job lifecycle, incidents and handover guard

- Claim-tag lookup on the bookings screen: a scan/entry bar that jumps straight to the matching job by tag ID or booking reference (camera scanning on mobile, keyboard wedge elsewhere).
- Incident handling: choosing "Frame damaged / snapped" or "Cancelled / refunded" prompts for an incident note, stored on the booking and shown in the job history line.
- Handover guard: marking a job "Collected" with an outstanding balance opens a payment drawer with the itemised balance; collection is blocked until settled, or a manager overrides with PIN and reason.

## Phase 4 — Taxonomy and barcode variants

- Catalogue settings gains the middle "Group" tier so the hierarchy is Category > Group > Sub-category, each with add, rename, reorder, delete and safe re-parenting.
- Multi-barcode variants per product, with a duplicate-barcode checker that refuses a code already used anywhere in the catalogue.
- Merge utility hardening: merging is refused while either product sits on an open booking, held ticket or unreceived purchase order, and each merge is written to the item activity log.

## Technical notes

- New routes `src/routes/pos.general-booking.tsx` and `src/routes/pos.racket-service.tsx`; shared intake logic moves out of `src/routes/index.tsx` into `src/components/pos/booking/` so both pages and the register use one source of truth.
- Booking writes keep going through `commitBooking` in `src/lib/bookings-db.ts`; the `incident_note` column added in Phase 1 is already mapped, so Phase 3 needs no further migration.
- Barcode variants use the `products.barcode_variants` column added in Phase 1; the Group tier reuses the existing `products.product_group` column and `product_categories` parenting.
- Overrides reuse the existing manager-PIN gate used by voids and refunds, and every override records staff, reason and timestamp in the audit log.