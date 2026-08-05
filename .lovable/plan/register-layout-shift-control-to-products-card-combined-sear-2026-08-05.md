# Register layout: shift control to products card + combined search row

## 1. Move the shift control into the product catalog card
The Open/Close shift toggle currently sits in the cart header next to the "Current ticket" text, where it can overlap or crowd the status line on narrow windows. Move it to the `CatalogPanel` header action row, where the Customer screen and Open shift buttons already live.

- Add an `onCloseShift` prop to `CatalogPanel` so it can open the existing close-shift dialog.
- In the `CatalogPanel` header, render the shift toggle as the left-most button:
  - When no shift is open: **Open shift** button.
  - When a shift is open: **Close shift** button (gated by the existing `register.closeShift` visibility and `can_close_shift` permission check).
- Keep the existing close-shift dialog in `src/routes/index.tsx`; the panel only calls back to open it.
- Remove the shift toggle from the cart header so the header only shows the ticket status text and the cart action buttons (Add product / Exchange / Clear).

## 2. Put scan bar and loyalty member search in one half-half row
The barcode scan input and the member search input are currently stacked vertically in the center cart column. Rearrange them into a single 50 / 50 row.

- In `src/routes/index.tsx`, wrap the existing `ScanBar` and the member search block in a two-column grid: `grid-cols-[1fr_1fr] gap-3` on viewports that have enough room, and let it stack vertically on narrow screens.
- Preserve the existing member-selected state (badge + Vouchers / History / Detach buttons) and the match list below the member search.
- Keep both inputs functionally identical: the scan bar still auto-focuses and catches keyboard-wedge scans; the member search still shows live matches and attaches members.

## 3. Verify no regressions
- Confirm the shift button still opens/closes the correct dialogs and enforces permissions.
- Confirm the catalog panel `Customer screen` and shift buttons stay left-aligned and do not overlap the product grid.
- Confirm the scan bar and member search row does not overlap the cart lines below it on small screens.
- Run a build check and inspect the preview at the current 982×686 viewport.
