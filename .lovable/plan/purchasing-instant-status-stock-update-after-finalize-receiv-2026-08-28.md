# Purchasing: instant status + stock update after Finalize/Receive

## What I found

**Stock Operations (works):** posting calls `applyStockCount(...)` on the shared POS store, which
updates product quantities in React state immediately, then marks the draft posted and calls
`onChanged()` to refresh the records list. Nothing afterwards re-reads product quantities from the
server, so the screen keeps the new numbers.

**Purchasing (doesn't work):** `finalize()` in `src/routes/purchasing.tsx` does the right database
work, but its post-save UI steps undo themselves:

1. Stock quantity: it calls `adjustStock(...)` (optimistic, correct) and then immediately
   `await syncProducts(...)`. Invoice and stock writes go through `commitOps` / the durable outbox,
   so the central copy is usually not updated yet — `syncProducts` pulls the *pre-receipt*
   quantities back from the cloud and overwrites the correct local figures. That is why the number
   only looks right after a reload (by then the outbox has flushed).
2. Status: `refreshHistory()` / `refreshDrafts()` re-read `purchase_orders` straight from the cloud
   (`loadReceivingInvoices`), again before the queued write has landed, so the row still reads
   `draft`. There is no optimistic list update like Stock Operations has for its shared state.

So the missing step is not the database logic — it's that Purchasing throws away its own optimistic
result by re-reading a source that hasn't caught up yet.

## The fix

All inside `finalize()` (and the same pattern in the "save corrections to a received invoice" path)
in `src/routes/purchasing.tsx`:

- Apply the finalized invoice to the on-screen lists optimistically, the way Stock Operations
  applies its result to shared state: prepend the just-posted invoice to `history` and remove its id
  from `drafts`, before any network re-read.
- Stop the stale overwrite: don't `await syncProducts(...)` inline right after posting. Reconcile
  from the server only once the write has actually settled (after the refresh, and only merging rows
  whose figures are not behind the local ones), so a queued write can never roll the screen back.
- Keep `refreshHistory()` / `refreshDrafts()` as a follow-up reconcile so the list still converges on
  the stored truth — it just no longer decides what the user sees in the first second.

## Scope / non-goals

Only the post-Finalize UI refresh sequence changes. No change to what is written to the database,
to `commitOps`/outbox behaviour, to GRN reference numbering, to the draft autosave or the manual
"Save draft" button, or to the list view's columns and filters.
