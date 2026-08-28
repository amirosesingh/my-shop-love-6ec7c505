# Purchasing: reference numbers, Save Draft button, and a record list

## What I found (answers to your questions)

**1. The existing draft/auto-save works exactly as you described — I am building on top of it.**
On the Purchasing page, the moment the first line lands in the queue a draft id is minted and a
debounced save (800 ms) writes the whole entry — header plus lines — as a `purchase_orders` row with
`status = 'draft'`, its lines as `purchase_order_items`. Every later change (line, invoice number,
supplier, dates) updates that same row; the queue line id *is* the stored line id, so nothing piles
up. Resume, discard (kept as `cancelled` for audit) and finalize-in-place all exist. Drafts never
touch stock. None of that changes.

**2. The Stock Operations numbering pattern fits, but Purchasing needs its own series.**
`po_number` on a purchase order is the *supplier's* invoice number — typed in by the buyer and
required at finalize. It is not ours to generate. So Purchasing needs a second, internal reference
of our own (default prefix `GRN`, for goods received note) that sits alongside the supplier invoice
number, not in place of it. The generator and the settings screen are shared: I will widen the
existing numbering helper to take a series key so each series keeps a separate counter, and add a
second card to the existing Settings > Stock numbering screen (renamed "Document numbering") for the
receiving series. Same fields, same behaviour, no second mechanism.

**3. Reference number.** Format `GRN-BRANCH-PERIOD-0001`, admin-configurable prefix, starting
number, digit length (3–6), reset rule (never / yearly / monthly) and whether the branch code is
included. It is minted once, on the first autosave that creates the draft row, and is never
regenerated — resuming, editing or finalizing all keep it. Legacy rows have no reference and simply
show "—".

**4. Manual "Save Draft" button.** One shared `persistDraft()` function; both the debounced timer and
the button call it. It carries an in-flight guard so a click during an autosave does not double-write,
and it cancels the pending timer so the same change is not written twice. The button reports
"Saved just now" using the existing saved-at timestamp. No new save path, no second draft.

**5. Default list view.** The existing "Invoices received history" table becomes the record list and
gains: a **Reference** column (ours) next to the supplier **Invoice no.**, a **Status** badge
(draft / posted / cancelled), and a **Status filter**. Existing columns stay: supplier, invoice date,
entry date, unique items, total units, total cost, operator, branch. The list will show drafts and
posted entries together instead of only posted, so nothing is hidden in a separate box — the existing
"Draft receiving orders" panel stays for the quick resume/discard workflow. The current-branch vs
all-branches toggle already exists for admins and is reused as-is.

**6. View vs edit.** Every row gets a **View** action opening a read-only dialog: reference, supplier
invoice number, status, branch, dates, operator, and the full line table with cost, price, qty and
subtotal. Drafts keep their **Resume** action. Posted rows keep today's correction dialog, but the
entry point is now gated by the same single `canEditPosted()` flag Stock Operations uses — it returns
false today, so the button is visible, disabled and labelled "Edit · needs approval". When Task 6/7
lands, that one function is the only thing to change.

**7. Risk.** Low, and deliberately contained:
- The autosave effect is not rewritten — it is refactored to call the shared save function, keeping
  the same body and dependencies.
- `reference` is a new nullable column with a partial unique index that ignores nulls, so every
  existing purchase order stays valid and untouched.
- Reports read `purchase_orders` by status and store; adding a column and showing drafts in the
  Purchasing list does not change what any report selects.
- The `po_number` uniqueness rule for posted invoices is unchanged, so no existing invoice conflicts.

## Technical details

- `src/lib/stock-ref.ts` gains a series parameter (`"stock" | "receiving"`) driving both the counter
  key and defaults; `StockNumberingSettings` is reused as the settings shape. Stock Operations keeps
  its current behaviour and counter.
- `src/lib/pos-types.ts`: `integrations.receivingNumbering` alongside `stockNumbering`.
- `src/routes/settings.stock-numbering.tsx`: two cards — "Stock count references" and "Goods received
  references" — each with a live preview.
- `src/lib/pos-db.ts`: `reference` carried in `invoiceRow`/`rowToReceivingInvoice`; `loadReceivingInvoices`
  gains a status option so the list can request all statuses.
- `src/routes/purchasing.tsx`: shared `persistDraft()`, Save Draft button, reference minting on draft
  creation, status filter, reference/status columns, View dialog, gated posted-edit button.
- New `src/components/pos/ReceivingRecordView.tsx` for the read-only dialog.
- Migration: `purchase_orders.reference text`, partial unique index on non-null references, index on
  `(store_id, status, created_at desc)`. Mirrored into `database/schema.sql`,
  `electron/db/offline_sqlite_v2.sql`, `electron/db/cloud-columns.json` and `src/lib/central-schema.ts`,
  verified in sync before finishing.

## Open question

The reference prefix defaults to `GRN`. Say the word if you would rather it be `PO`, `INV` or
something else — it is admin-editable either way, this only sets the default.
