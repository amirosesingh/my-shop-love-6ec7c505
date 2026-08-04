# Fix shift sync + all-shops inventory panel + auto SKUs

## 1. Shift sync error ("row-level security policy for table shifts")

The till pushes finished shifts to your own central database. That database rejects the write because the shifts table's access rules only accept a signed-in staff account, and the till pushes with the terminal's key instead.

Steps:
1. Confirm the exact identity used by the push (inspect the outgoing request from the sync engine and the current sign-in state of the central-database client) before changing anything. The diagnosis above is the most likely cause but is unconfirmed until this check runs.
2. Ship `supabase/schema17.sql` (run once on the central database) that:
   - re-creates the shifts / shift_sessions access rules so an activated terminal can insert and update its own shift rows,
   - keeps read access limited to staff,
   - re-applies the matching grants.
3. Improve the sync log message so a rules rejection reads "This terminal is not allowed to write shifts on the central database — run supabase/schema17.sql", instead of the raw database text.
4. Re-open a shift and confirm the Sync tab shows a green Synced row.

## 2. All-shops dashboard and inventory panel

New page **All shops** (sidebar, under Live Dashboard), open to anyone with inventory access:
- Top: per-shop cards with today's sales, transactions and open/closed shift status.
- Below: a single stock table — one row per product, one column per shop, plus a total column, with search, low-stock highlighting and CSV export.
- Filters: shop selector, category, "below reorder level only".

## 3. Automatic catalog sync across shops

Product details (name, barcode, SKU, category, prices, tax rate, reorder level, visibility) become shop-independent: adding or editing a product anywhere writes one shared catalog record that every shop sees after sync. Stock counts stay per shop, as today.

- When a product is created, every existing shop automatically gets a stock entry starting at 0, so it appears in all branches straight away.
- New shops added later back-fill zero entries for the whole catalog.
- Edits queue through the existing offline outbox, so an offline branch picks the change up when it reconnects.

## 4. Automatic SKU generation

New **SKU numbering** block in Settings (Business & pricing):
- Mode: Automatic or Manual (default Automatic).
- Automatic uses a plain running number, `SKU-000123`, with an editable prefix and a next-number counter shown in settings.
- In Automatic mode the SKU field on the product form is filled and read-only, with an "Override" toggle for one-off manual entry.
- Bulk import respects the mode: blank SKU columns get generated numbers.

## Technical notes

- `supabase/schema17.sql`: policy rewrite for `shifts`, `shift_sessions`; idempotent.
- `src/lib/sync-engine.ts`: friendlier message for RLS rejections (code 42501).
- New `src/routes/all-shops.tsx` + `src/components/pos/AllShopsPanel.tsx`; reads existing `products.stockByStore`, `sales`, `shifts` from the store — no schema change.
- `src/lib/pos-store.tsx`: back-fill zero stock entries on product create and on store create.
- New `src/lib/sku.ts` for generation; settings extended with `sku: { mode, prefix, next }`, persisted with the rest of POS settings.
- `src/components/pos/nav-config.ts` and inventory hub gain the new entry.
