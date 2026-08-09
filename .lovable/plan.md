# Product deletion protection, archiving, and finishing the session work

## What I confirmed first

- `sale_items.product_id` currently uses `ON DELETE SET NULL` (`supabase/sql/04_register_sales.sql:160`), so a delete can succeed and quietly detach the item from past receipts. The blocked-delete dialog only appears for the other tables that do restrict.
- `products` has no active/archived column today, so "Hide instead" reuses the web-catalogue flag; there is no real archive state.
- Deletion is already awaited (`deleteProductNow`), but the inventory screen has no busy state — the row buttons stay clickable while the check runs.
- The hashed-session work from last round is in place (`user_sessions`, bearer tokens, idle limits, admin PIN bypass). What is still missing is the per-person idle override in Staff Management and the admin "Active terminals & sessions" panel.

## 1. Protect sales history at the database

New SQL file `supabase/schema30.sql` (additions only, nothing dropped):

- Re-point `sale_items.product_id` to `ON DELETE RESTRICT`, so a product on any bill can never be removed.
- Add `is_archived` (boolean, default false) and `archived_at` to `products`, with the existing grants unchanged.
- `product_delete_guard(product_id)` — a routine that reports whether the item is used by sales, purchase orders, transfers, adjustments or promotions, so the app can ask before it tries.

This file must be run once against your database.

## 2. Ask before deleting, and never half-delete

- The delete path first calls the guard. If sales exist, nothing is attempted; the app reports the conflict code `PRODUCT_HAS_SALES_HISTORY` with the plain-language reason.
- Offline or queued mode checks the local `sale_items` table the same way before queueing anything, so an offline till gives the same answer.
- A raw database refusal is still translated as it is today, as a second line of defence.

## 3. Deleting shows it is working

- Clicking Delete (single row or bulk) immediately disables that row's actions and the bulk bar and shows "Checking sales history…" on the button, with an overlay for bulk runs.
- No toast, no row disappearing, no dialog until the final answer arrives. Repeat clicks are ignored while a check is running.

## 4. The refusal dialog offers archiving

The existing dialog is reworded and gains the archive action:

- Title: "Product cannot be deleted"
- Body: "This product has sales recorded in previous shifts or past transactions. Deleting it would distort historical sales reports and receipts."
- Primary: "Deactivate / archive product" — sets `is_archived`, keeps every record intact.
- Secondary: "Cancel"

Bulk delete removes what it can and lists the kept ones with reasons, offering "Archive the blocked ones".

## 5. Archived products disappear from selling, stay in history

- Register catalogue, product search, barcode scan and the web catalogue skip archived items.
- Inventory gets an "Archived" filter and a "Restore" action so an admin can bring one back.
- Receipts, reports and analytics keep reading the full product record, so past figures never change.

## 6. Finishing the session and permission work

- Staff Management gains the per-person "Idle timeout (minutes)" field, resolved as person then role then branch default.
- New admin-only **Active terminals & sessions** panel: branch, device, staff, last activity, with **Remote reset** to revoke that terminal and end its open sessions; the remote till drops to sign-in on its next call.
- A check that the admin PIN bypass behaves identically on web, Windows and Android, including the auto-approved entry in the override log.

## Technical notes

- `supabase/schema30.sql` as above; `supabase/sql/03_catalog.sql` and `04_register_sales.sql` updated to match for fresh installs.
- `src/lib/product-delete.ts`: add the `PRODUCT_HAS_SALES_HISTORY` code and a `checkProductDeletable` helper used by both the live and local paths.
- `src/lib/pos-db.ts`: guard call inside `deleteProductNow`, plus `archiveProducts`; `src/lib/local-db.ts` mirrors the guard for the offline bridge.
- `src/lib/pos-store.tsx`: `deleteProductIds` returns `{ deleted, blocked }`; new `archiveProducts` / `restoreProducts`; `archived` added to the `Product` type and the row mappers.
- `src/routes/inventory.tsx`: `deletingIds` state driving the disabled/spinner UI, archived filter, restore action; `ProductDeleteBlockedDialog` gets the new copy and archive action.
- Catalogue reads filtered in `src/components/pos/CatalogPanel.tsx`, `src/lib/product-lookup.ts` and the public catalogue query.
- `src/routes/staff.tsx` per-person idle field; new `src/routes/settings.sessions.tsx` backed by the existing `src/lib/user-sessions.functions.ts`.
- Patch version bump as usual.
