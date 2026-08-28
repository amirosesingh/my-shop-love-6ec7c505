# Remove "Stock Check" from the Inventory tab

## What I found

"Stock Check" is not a route or a backend endpoint — it is a dialog opened from a button on the Inventory catalog page. The same job (physical counts, variance, reasons, cost impact) is already done properly by the **Stock Operations** page (`/stock-operations`), which posts through the exact same store action. So removing it loses no capability.

Findings from reading the code:

- The button lives in the Inventory header (`src/routes/inventory.tsx:256-259`) and opens `StockCountDialog`.
- The dialog and a sibling single-product `StockAdjustDialog` both live in `src/components/pos/StockAdjust.tsx`.
- `StockAdjustDialog` is already dead code: its `adjustTarget` state is only ever *cleared*, never set — nothing in the app opens it.
- Both dialogs call `applyStockCount()` from `src/lib/pos-store.tsx`, which is **shared** with Stock Operations. It stays untouched.
- History is written by `db.recordStockAdjustment` and read by the **Stock Adjustments** report (`/reports/stock`). Untouched, so past records remain viewable.
- Nav config has no Stock Check entry — nothing to remove there. Permissions (`can_adjust_stock`) stay, since Stock Operations uses them.

## Files to change

| File | Change | Why |
| --- | --- | --- |
| `src/routes/inventory.tsx` | Remove the "Stock check" button, the `countOpen` state, the `StockCountDialog`/`StockAdjustDialog` render block, the `adjustTarget` state, and the now-unused `ClipboardCheck` + `StockAdjust` imports. | Removes the entry point and all dead references. |
| `src/components/pos/StockAdjust.tsx` | Delete the file. | Both exports become unreachable once Inventory stops importing them. |

Then a pointer for users: the Inventory page keeps its existing links, and Stock Operations remains reachable from the Inventory & Supply hub and the sidebar, so counts still have an obvious home.

## Risks

- **Shared code:** `applyStockCount`, `STOCK_ADJUSTMENT_REASONS`, and `recordStockAdjustment` are shared with Stock Operations — none are removed.
- **Historical data:** no schema, migration, or report change. `/reports/stock` continues to show every past adjustment, including ones created by the old dialog.
- **Single-product adjust:** deleting `StockAdjustDialog` removes a feature that is already unreachable in the UI. If you ever intended to wire it up, say so and I'll keep the file.
- **Tests/docs:** I'll grep for references after the edit so nothing imports the deleted module.

## Open questions

1. Delete `StockAdjust.tsx` outright, or keep the unused single-product `StockAdjustDialog` for future use?
2. Should the Inventory header get a small "Stock operations" link in place of the removed button, or nothing at all?
3. Confirm: keep `/stock-operations` fully active (it is the replacement) — yes?

## Technical notes

No backend, API route, migration, RLS policy, or permission flag is affected. Post-change verification: typecheck plus a grep for `StockAdjust`, `StockCountDialog`, and `countOpen` to confirm zero dead imports, then a preview load of `/inventory` for console errors. Version bump via `node scripts/bump-version.cjs`.
