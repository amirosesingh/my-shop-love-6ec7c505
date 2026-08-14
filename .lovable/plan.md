# Phase 4 — Catalogue taxonomy, barcode variants and safer merges

Final phase of the racket service and booking programme. Everything here is catalogue-side.

## Group tier in the taxonomy

Catalogue settings currently has two levels (Category and Sub-category). Add the middle "Group" level so the hierarchy reads **Category > Group > Sub-category**:

- Each level supports add, rename, reorder (move up/down) and delete.
- Deleting a level that still has children asks where to re-parent them instead of silently cascading, and refuses while products are still attached.
- Product edit in Inventory gains a Group picker that filters the Sub-category list, and the Inventory filter bar gains a Group filter.

## Multi-barcode variants with a duplicate checker

- The "Extra barcodes" editor becomes a variant list: each row holds the barcode plus an optional label (colour, size, pack).
- Before a code is accepted it is checked against every barcode, SKU and variant in the catalogue; a code already in use is refused and names the product holding it. The check also runs on the main barcode field and on bulk import.
- Scanning any variant at the till, in stock operations and in purchasing resolves to the parent product exactly as alias barcodes do today.

## Merge utility hardening

- Merging is refused while either record sits on an open booking, a held ticket or an unreceived purchase order, and the dialog lists what is blocking it.
- Every completed merge writes a line to the item activity log (who merged, which records were folded in, which barcodes carried over), visible in the item activity drawer.

## Technical notes

- Group is stored in the existing `products.product_group` column and as a `product_categories` row parented to its category; `src/lib/catalog-meta.ts` gains group-aware helpers plus rename, reorder and re-parent functions, and `Product` in `src/lib/pos-types.ts` gains `group?: string`.
- Variant labels ride in the existing `products.barcode_variants` jsonb column, mapped in `src/lib/pos-db.ts`; `src/lib/product-lookup.ts` folds variant codes into the scan index so no scanning surface needs changing.
- Duplicate detection is one helper in `product-lookup.ts`, reused by the inventory editor, bulk import and stock operations.
- Merge blocking reuses the usage-guard shape in `src/lib/product-delete.ts`, extended with booking, held-order and open-PO checks; the audit line goes through the existing item activity feed.
- No new tables: both columns were added in Phase 1, so no migration is expected.