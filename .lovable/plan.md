# Stock Requests & Transfers — repair and finish

## What the audit found

Confirmed by reading the code and querying the database.

Already working, and reused as-is:
- `stock_transfers` / `stock_transfer_items` with four quantities per line (requested, approved, dispatched, received), a database trigger enforcing the status graph, and RPCs `stock_transfer_approve` / `_dispatch` / `_receive`.
- Source stock leaves at **dispatch**; destination stock is credited at **receive**. Both write `item_activity_logs` rows (`transfer_out` / `transfer_in`), so the movement ledger already exists.
- Group/cluster scope (`transfer_scope`, `from_group_id`, `to_group_id`) with cross-cluster catalogue re-mapping by barcode on arrival.
- Permissions through `has_perm` / `is_supervisor_now`, enforced in the database, not only in the UI.
- Status history via `trackTransition`, plus per-branch "approval required" resolved centrally.
- Sub-warehouse pick planning (`planDeduction`) and spreadsheet import of transfer lines.

Broken or missing:
1. Product picking is a plain dropdown listing every product — no search, no barcode/SKU/brand/category filters, no destination-stock column. The register's `ProductSearchDialog` is cart-specific (it can create products and link barcodes) and is not reusable here.
2. Request, transfer and receiving all happen in small dialogs.
3. **Mark received posts stock immediately.** There is no physical-verification step and no place to record a discrepancy reason.
4. `stock_transfer_dispatch` clamps stock at zero (`GREATEST(... , 0)`) instead of refusing when the source is short — a silent stock error if two branches dispatch the same units.
5. Neither screen re-checks live source stock at approve/dispatch time; validation uses the numbers loaded into the browser.
6. A request shows the source branch's stock only as a small line of text, and never the requesting branch's own stock.

Per your decisions: a request still **closes at dispatch** (a shortfall stays a shortfall; raise a new request for the rest), the workspaces become **dedicated routes**, and verification is **always required**.

## What will be built

### 1. One reusable product picker
A new shared picker used by both the request and the transfer workspace: search across name, barcode, SKU, brand, category and subcategory, partial and case-insensitive, with category/subcategory filter chips and a clear-filters action. Results are a table — Name, SKU, Barcode, Brand, Category — plus a stock column for the source branch and one for the destination branch. Adding a line always references the existing product id, never creates a product, and re-adding a product bumps the existing line instead of duplicating it. Large catalogues query through the existing indexed barcode/product lookup rather than loading everything.

### 2. Full-window workspaces
Three dedicated pages replacing the dialogs:
- `/transfers/new` — direct transfer or request, source and destination pickers, the product picker, per-line quantities with live availability.
- `/transfers/$id` — the transaction workspace: reference, type (direct vs request), status, route, cluster, every quantity side by side (requested / approved / dispatched / received / verified / difference), notes, activity timeline, and the action for whatever step is next.
- Receiving lives inside `/transfers/$id` as a full-height verification panel.

The existing `/transfers` list stays as the log and gains status and route filters; its dialogs are removed once the routes replace them.

### 3. Receiving with mandatory verification
The lifecycle becomes:

```text
awaiting approval → approved → dispatched (in transit)
    → received (arrived, nothing posted)
    → verified → completed (stock posted)
```

Marking a transfer received only records arrival. The verification panel then lists each product with transferred quantity, a physical-count box, and the live difference. Confirming verification posts the verified quantity to the destination branch in one database call and closes the transfer as `completed`, or `completed_with_discrepancy` when any line differs — with a reason required for that case. Transferred quantities are never overwritten; the discrepancy stays visible in the record and in item history.

### 4. Safety
- Posting is idempotent: the RPC locks the row, refuses anything already posted, and the button disables while in flight, so a double-click, refresh or retry cannot add stock twice.
- Dispatch stops refusing silently — it raises a clear "short by N at <branch>" error and moves nothing, instead of flooring stock at zero.
- Both dispatch and verification re-read current stock inside the database transaction, so a stale on-screen number cannot authorise a movement.
- Handled explicitly with messages: insufficient stock, inactive or missing product, invalid or identical branches, zero/negative quantity, duplicate submission, already received, already posted, missing permission, and connection failure.

### 5. Compatibility
Existing transfers in every current status keep opening and displaying correctly; historical `received` rows are treated as already posted and shown as completed, with no re-posting and no identifier changes.

## Technical notes

- Migration: `stock_transfers` gains `verified_by`, `verified_at`, `posted_at`, `discrepancy_reason`; `stock_transfer_items` gains `quantity_verified`. The lifecycle trigger gains the `received → verified → completed` edges, keeps existing rows valid, and backfills legacy `received` rows as posted. Grants and RLS follow the existing branch-visibility pattern. Mirrored into the guarded `database/schema.sql` and registered for push/pull/restore in `electron/db/repo.cjs`.
- New RPC `stock_transfer_verify(p_transfer_id, p_verified_by, p_lines, p_reason)` performs the destination credit and `transfer_in` ledger rows that `stock_transfer_receive` does today; `stock_transfer_receive` is reduced to recording arrival only. `stock_transfer_dispatch` changes its clamp into a raised exception when source stock is short.
- `src/lib/stock-transfers.ts` gains `verifyTransferInDb`; `pos-store.tsx` splits `receiveTransfer` into `receiveTransfer` (arrival) and `verifyTransfer` (posting), with the optimistic stock bump moving to verification.
- New `src/components/pos/ProductPicker.tsx`; new routes `src/routes/transfers.new.tsx` and `src/routes/transfers.$id.tsx`; `TransferStepDialog` is retired once both routes carry its steps.
- `TransferStatus` gains `verified`, `completed`, `completed_with_discrepancy` with labels; `trackTransition` fires on each new step; `feature-schema.ts` and `sync-coverage.ts` updated for the new columns.
- Verification tested end to end against the database — full receipt, short receipt with a difference, double-post attempt, cross-cluster arrival, and reopening a pre-change transfer.
