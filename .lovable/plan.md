# Sub-Warehouse Management, Smart Routing & Safe Schema Updates

## 1. Health audit first (report, then fixes)

A written audit pass over the app before any code changes, covering:

- **Schema links** — every field the location, receiving and transfer screens write, checked against both the local SQLite schema (`database/schema.sql`) and the cloud schema. Anything the app writes that the database does not declare is listed as a gap and closed by an additive column.
- **Relations** — child rows that point at a parent (transfer lines, purchase order lines, stock movements, sub-locations) checked for a declared foreign key and an index on the lookup column.
- **Logic flow** — receiving, put-away and transfer paths checked for unhandled failures, missing loading/empty states and actions that silently do nothing.

The findings land in the existing Logic Health / Database Health screens plus a short summary in chat. No claim of a specific defect is made before the scan runs.

## 2. Location drawer with sub-warehouses

Location management moves out of the full-page list into a **right-hand slide-out drawer** (the same drawer pattern already used in Settings). Inside the drawer:

- **Location type** — Store or Warehouse.
- If Warehouse: a toggle, "Create sub-warehouses for this location?"
- If yes: pick how many, then name each one (e.g. "Warehouse 1 — Ground Floor", "Warehouse 2 — Upper Floor").
- One sub-warehouse can be marked **Default primary** — the level fast-moving stock is picked from first.
- Editing an existing warehouse reopens the same drawer with its sub-levels listed; sub-levels can be added, renamed or archived. Archiving still respects the existing "must be empty" guard, so no history is lost.

Existing single-location setups are untouched: a warehouse with no sub-levels keeps behaving exactly as today.

## 3. Receiving on the ground-floor terminal

Goods-in stays a single-terminal action. After an invoice posts into the hub:

- If the receiving warehouse has sub-levels, the put-away panel asks **which level** each line goes to, defaulting to the primary.
- The chosen sub-level's balance goes up; the parent warehouse shows the **rolled-up total** of all its levels, so every existing report and stock view still reads a whole-warehouse number.

## 4. Outbound transfers — automatic level picking

When stock leaves a warehouse for an outlet, the level is chosen for the operator:

```text
item in one level only     -> take it all from that level
item in both levels        -> take from Default primary first
                              shortfall  -> top up from the second level
neither level has enough   -> block with "short by N units", nothing moves
```

The transfer screen shows the resulting breakdown ("12 from WH-1, 3 from WH-2") before confirming, so the operator can see where stock actually left from. Unit cost travels with each portion, so cost never changes as stock moves between levels or to an outlet.

## 5. Database scripts — safe, repeatable, no data loss

- `database/schema.sql` (local SQLite) and a new `supabase/schema.sql` (cloud) are both rewritten as **additive-only** scripts: create tables only when absent, add columns only when absent, add indexes and foreign keys only when absent. No table is dropped, recreated or emptied.
- Both can be run repeatedly on a live database with no effect the second time.
- Local schema still never runs itself at startup — applying it stays a deliberate button press.
- A short migration summary lists exactly which objects each script adds and confirms no existing row is touched.

The app version is bumped.

## Technical notes

- `Store` gains `isPrimarySub` (default pick level) alongside the existing `locationType` / `parentId` / `isCentral`; sub-levels remain ordinary rows in `stores`, so nothing about branch scoping, RLS or sync changes.
- Rolled-up warehouse stock uses the existing `rolledUpStock` helper in `src/lib/locations.ts`; a new `planDeduction(product, warehouse, qty)` there returns the per-level split and is the single source used by transfers and any future picking flow.
- Sub-level put-away keeps using the paired negative/positive stock-adjustment path already in Purchasing, so movements stay in inventory history.
- Cloud changes are applied through the migration tool with the same additive SQL that `supabase/schema.sql` contains, so the file and the live database stay identical.
