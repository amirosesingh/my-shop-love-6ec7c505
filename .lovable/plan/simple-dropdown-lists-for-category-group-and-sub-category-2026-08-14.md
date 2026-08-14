# Simple dropdown lists for Category, Group and Sub-category

Replace the nested taxonomy (parent/child tree) with three plain lists you manage in one settings menu, and use those lists as simple dropdowns everywhere products are entered.

## 1. One settings menu for all three lists
On Settings → Catalogue, show three side-by-side list editors:
- Categories
- Groups
- Sub-categories

Each editor: an "Add" input, inline rename, delete, and drag-free ordering by sort number. No parent selection, no nesting, no filtering of one list by another. Units of measure stay as they are today.

## 2. Dropdowns on products
Anywhere a product is created or edited, the three fields become plain dropdowns fed by those lists (plus a "None" option):
- Inventory (add/edit product dialog and any inline edit)
- Purchasing / receiving order lines
- Any bulk-import mapping keeps accepting free text, but unknown values are offered as "add to list" instead of silently creating hierarchy

Existing values that aren't in a list are still shown as the selected option so nothing is lost.

## 3. Data changes
- `product_categories` gets a `kind` column (`category` | `group` | `sub`), defaulting existing rows to `category`, and `parent_id` stops being used for products (kept nullable for safety).
- Rows previously stored as children get flattened: a child under a category becomes a `sub` entry, keeping its name.
- Products keep their existing `category`, `product_group` and `sub_category` text columns — only the picker changes.

## Technical notes
- `src/lib/catalog-meta.ts`: drop tree helpers, expose `readCategories()`, `readGroups()`, `readSubCategories()` backed by the `kind` column, with the same localStorage mirror for offline tills.
- `src/routes/settings.catalog.tsx`: replace the tree UI with three identical list editor components.
- `src/routes/inventory.tsx` and `src/routes/purchasing.tsx`: swap free-text/hierarchical inputs for `Select` components bound to the three lists.
- One migration adds the `kind` column, backfills it, and flattens child rows.
