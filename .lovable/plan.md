# Racket service module, liability terms and stock operations completion

## What the audit found (verified in code and schema)

Confirmed present and working:
- Booking rules settings page with deposits, turnaround, tension defaults, combo rule and a supervisor gate on labour overrides.
- Booking queue at `/bookings` with job status chips (received → strung → ready → collected), part payments, and a "Collect & settle" flow that blocks collection when the "block collection with balance" rule is switched on.
- `/stock-operations` with the barcode punch bar, delta maths, PO-style review table, bulk .xlsx/.csv import and a transfers tab; the inventory list is read-only with an Item Activity drawer.
- Multi-barcode aliases on products, a merge dialog that folds aliases into a master, and a delete guard covering sales, purchase orders, transfers and adjustments.
- Four-tier settings resolution (Private > Branch > Cluster > Global > default) with a scope panel and source badges.
- `bookings.liability_accepted` and `bookings.technician` columns already exist in the database.

Confirmed missing:
1. No liability or service-terms text anywhere in the app — no settings field, no intake checkbox, no print output. The `liability_accepted` column is never written.
2. No technician picker in the intake UI, despite the column existing.
3. Racket intake and general booking share one modal inside the till; there are no dedicated `/pos/general-booking`, `/pos/racket-service` or `/pos/racket-service/queue` views.
4. The job lifecycle has only four states — no "Frame damaged / snapped" (with incident note) and no "Cancelled / refunded".
5. No claim-tag scanner on the queue.
6. Handover does not force settlement: it only blocks when an optional rule is enabled, and there is no itemised deposits/balance drawer.
7. Override / waive labour asks for a supervisor but never captures a mandatory reason note.
8. Taxonomy CRUD covers categories, sub-categories and units — no Group tier, and no deletion protection when products are attached.
9. Merge has no lock against items sitting on an unpaid booking or an open service job.
10. "Customer provided string" sets the price to zero but does not exclude that line from stock deduction.

## Plan

### Phase 1 — Liability and service terms
- Add a service-terms long text (pre-filled with the supplied default wording) and a high-tension threshold (default 26 lb) to the booking rules, editable in Settings under a new "Service terms & high-tension liability" block, scope-aware like every other rule.
- The intake shows the terms in a bordered agreement box with a mandatory acceptance checkbox. The box turns amber with a "High tension" badge when main or cross tension exceeds the threshold, or when either "customer provided" toggle is on. Saving is blocked with a toast until it is accepted.
- Persist acceptance to the booking, and print the terms as fine print at the bottom of both the job claim tag and the settlement receipt.

### Phase 2 — Separate workflows
- New views: `/pos/general-booking`, `/pos/racket-service` and `/pos/racket-service/queue`. The till's single "Manage Booking" button becomes a chooser that navigates to one of the two, so there is still one entry point but no shared modal.
- General booking: customer search with an inline quick-add drawer, catalogue search filtered by category, sub-category and barcode, a cart guard requiring at least one retail item, saved as unpaid pay-later.
- Racket service: a wide three-column intake — left, customer plus racket/string pickers with taxonomy filters and customer-provided toggles; middle, tension specs, inspection notes, technician dropdown of active branch staff, promised date and time, and the agreement box; right, add-ons, price breakdown, override/waiver controls and voucher selection.
- Customer-provided lines are flagged so the save path skips their stock deduction.

### Phase 3 — Lifecycle, scanner and handover guard
- Extend the job statuses with "Frame damaged / snapped" (requires an incident note) and "Cancelled / refunded"; the note is stored on the booking and shown on the queue card.
- The queue gains a scan bar: scanning a claim tag opens that job card directly.
- "Handover / collect racket" always checks the balance. With money outstanding it opens a payment drawer listing every past deposit and the balance due; only a full payment moves the job to collected and prints the settlement receipt.
- Override charge / waive labour opens one authorisation modal requiring both a reason (dropdown plus free text) and a manager PIN; the reason is written to the booking and the audit trail.

### Phase 4 — Taxonomy, duplicates and merge lock
- Add the Group tier between category and sub-category (reusing the existing self-referencing category table), full CRUD for categories, groups, sub-categories and units, and a blocking modal when products are still attached.
- Real-time duplicate-barcode warning while a code is typed on the product form.
- Merge blocked with a clear reason when either item is linked to an unpaid booking or an open service job; per-barcode variant pricing and batch cost captured alongside each code.

### Technical notes
- Existing tables are reused rather than duplicated: bookings already act as service jobs, booking payments as payment transactions, the category table as the taxonomy tree, barcode aliases as multi-barcode, and stock adjustments as movement history. Migrations add only what is genuinely absent: incident note, override reason, per-barcode variant data, and a group reference on products.
- The new settings ride the existing scoped rules engine, so a branch or an individual can override the terms text and the tension threshold.
- Each phase is checkable in the preview before the next begins.