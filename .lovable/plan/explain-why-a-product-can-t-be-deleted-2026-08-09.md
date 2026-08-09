# Explain why a product can't be deleted

Today the delete button removes the row from the screen and fires the delete at the
database without waiting. When the database refuses — because the item appears on past
bills — the user only sees the raw message "violates foreign key constraint
sale_items_product_id_fkey", and the product silently comes back on the next refresh.

## What changes

- Deleting a product (single row or bulk selection) waits for the database to confirm.
- If the database refuses, the product stays in the list and a popup explains it in plain
  language, for example:

  "Cannot delete "Yonex BG65" — this item appears on past sales, so removing it would break
  those receipts. You can hide it from the till and the web catalogue instead."

  The dialog names what blocks it (past sales, purchase orders, transfers, stock
  adjustments, promotions) based on the message the database returns, with a "Hide instead"
  action that takes the item off the till and web catalogue, plus a Close button.
- Bulk delete reports per item: items that could be removed are removed, and the popup lists
  the ones that were kept with the reason and offers "Hide the blocked ones".
- The same popup is reused by merge-duplicates when the losing product can't be removed.

## Technical notes

- `db.deleteProduct` currently fire-and-forgets through `queue(...)`; route product deletes
  through `commitOps` so the promise rejects with the database error.
- `removeProduct` / `removeProducts` in `src/lib/pos-store.tsx` become async, prune local
  state only for ids that actually deleted, and return `{ deleted, blocked: { id, reason }[] }`.
- Helper maps Postgres constraint names to human reasons
  (`sale_items_product_id_fkey` → past sales, `purchase_order_items_*` → purchase orders,
  `stock_transfer_items_*` → transfers, `stock_adjustments_*` → stock adjustments,
  `promotions_foc_product_id_fkey` → promotions), with a generic fallback.
- New `ProductDeleteBlockedDialog` in `src/components/pos/`, driven from state in
  `src/routes/inventory.tsx`, using the existing shadcn `AlertDialog` styling.
- "Hide instead" reuses `patchProducts` with `ecomVisible: false` — no schema change and
  nothing is deleted.
- Patch version bump as usual.