# Simplify catalogue taxonomy to three flat lists

Replace the nested Category > Group > Sub-category tree with three plain lists managed in one place, used as dropdowns everywhere a product is entered.

## What changes for you

- **Settings > Catalogue** shows three simple boxes: Categories, Groups, Sub-categories (plus the existing Units box). Each is a text field with "Add" and a list you can rename or delete. No parents, no nesting.
- **Inventory** product form: Category, Group and Sub-category each become a dropdown listing every entry from its own list (independent of one another). The filters at the top of the list work the same way.
- **Purchasing** (new item row): the free-text Category field becomes the same dropdown.
- Existing values saved on products are kept; if a product holds a value missing from the list, the dropdown still shows it so nothing is lost.
- Deleting an entry still warns when products are using it.

## Technical notes

- Migration on `product_categories`: add a `kind` column (`category` | `group` | `sub`, default `category`). Existing rows backfilled by depth: top-level -> `category`, children -> `group`, grandchildren -> `sub`. `parent_id` stays but is no longer written or read.
- `src/lib/catalog-meta.ts`: `ProductCategory` gains `kind`; drop `topCategories`, `groupsOf`, `subCategoriesOf`, `childrenOf`, `reorderCategory`, `reparentChildren` in favour of a single `listByKind(all, kind)`. Save/delete keep the same localStorage mirror behaviour.
- `src/routes/settings.catalog.tsx`: rewritten as three identical flat list editors sharing one small sub-component.
- `src/routes/inventory.tsx`: filters and the edit drawer read from `listByKind`; group/sub no longer reset when the category changes.
- `src/routes/purchasing.tsx`: category input swapped for the category dropdown.