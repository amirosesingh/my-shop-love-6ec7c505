# Fix product save/sync 400 errors

## What's actually wrong

Product saves send two fields the central database does not have.

Every product write goes through one mapper (`productToRow` in `src/lib/pos-db.ts`), and it always includes `is_archived` and `archived_at`. A live check of the `products` table shows those two columns do not exist there — the archive migration was written but never applied to this database. The API rejects the whole request with a 400 ("column not found in schema cache"), so product creation, edits, bulk import and the background product sync all fail together.

The product entry form already converts every numeric input with `Number(...) || 0`, so empty strings are not the cause there — but the mapper passes values straight through, so a bad row from an Excel import or an older offline queue entry can push a decimal into the integer stock column and produce the same 400.

## The fix

1. Add the missing columns to the database
   - `is_archived` (true/false, default false) and `archived_at` (optional timestamp) on the products table, plus an index for filtering out archived items.
   - Saved as a numbered SQL file (`supabase/sql/33_products_archive_columns.sql`) so it can also be run against the on-premise/offline database.

2. Harden the product payload mapper
   - Coerce every numeric field through a strict helper: `cost_price`, `selling_price`, `ecom_price`, `tax_rate`, `custom_points`, `reorder_level`, `stock_quantity`, `landing_pct`. Empty strings, `null`, `NaN` and `Infinity` become `0` (or `null` for the optional ones).
   - Round integer columns (`stock_quantity`, `reorder_level`) so a decimal never reaches an integer column.
   - Guarantee JSON shapes: `stock_by_store` always a plain object of numbers, `packs` always an array, `barcode_aliases` always an array of non-empty strings.
   - Keep the existing rule that stock is only written when the caller actually carries the per-branch map.

3. Sanitize bulk import rows
   - Apply the same numeric coercion when Excel/CSV rows become products, so a blank or text cell cannot poison the payload.

4. Keep the local (Electron) side aligned
   - Ensure the local SQL schema and writer accept the archive columns, so cloud and local rows stay in step and the sync engine stops dropping fields.

## Verification

- Create a product, edit a price, archive a product, run a bulk import — all succeed with no 400.
- Confirm background product sync stops erroring.
- Typecheck plus existing sync/commit regression tests.

## Technical notes

- Root cause confirmed by querying `information_schema.columns` for `public.products`: no `is_archived`, no `archived_at`.
- No `on_conflict` column list is used for products; the relay upserts on `id`, so no conflict-target change is needed.
- The numeric helper lives next to `productToRow` in `src/lib/pos-db.ts` and is reused by `src/components/pos/BulkImportDialog.tsx`.