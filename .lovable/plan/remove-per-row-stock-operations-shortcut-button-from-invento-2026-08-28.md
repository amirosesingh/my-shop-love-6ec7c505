# Remove per-row Stock Operations shortcut button from Inventory list

## Current state

- The Inventory list is rendered by `src/routes/inventory.tsx`, component `Inventory`.
- In the **Stock · {currentStore.code}** column (lines 730–755), each row shows:
  - A read-only `Badge` with the current stock quantity (`stockAt(p, currentStore.id)`).
  - A small ghost icon button (only when `canAdjust` is true) that navigates to `/stock-operations`.

## Exact location of the button

- **File:** `src/routes/inventory.tsx`
- **Component:** `Inventory`
- **Lines:** 742–753 (inside the `<TableCell>` that starts at line 730)
- **Current handler:**
  ```tsx
  onClick={() => navigate({ to: "/stock-operations" })}
  ```
  It does **not** pass the product ID or any other context — it simply opens the Stock Operations page.

## Planned changes

1. `src/routes/inventory.tsx`
   - Remove the icon-only `<Button>` block (lines 742–753) from the stock column while leaving the `<Badge>` stock quantity display untouched.
   - Remove the now-unused `Scale` import (line 10).
   - Remove the now-unused `canAdjust` permission check (line 128) because it is only used for this button.
   - Keep `useNavigate`, `usePos`, `useAuth`, and `stockAt` because they are used elsewhere in the file.

## What is intentionally NOT changing

- `/stock-operations` route and page (`src/routes/stock-operations.tsx`) remain fully active.
- The side-navigation entry for Stock Operations (`src/components/pos/nav-config.ts`) stays as the primary way to reach the page.
- Historical stock data, `stockAt` helper, `Badge` styling, and the read-only stock quantity are preserved.
- No backend, API, migration, RLS, or permission model changes are needed.

## Risks / shared code

- `can_adjust_stock` permission remains required for the Stock Operations page itself; only the Inventory shortcut button is being removed.
- `Scale` icon and `canAdjust` variable appear to be used only by this button. Removing them should not affect other features.
- The `/stock-operations` route is reachable from the side nav, so removing the per-row shortcut does not create a dead route.

## Verification after change

- Run `bunx tsgo --noEmit` to confirm no type errors.
- Load `/inventory` in the preview and confirm:
  - Stock quantity badge is still visible in each row.
  - No scale/adjust icon appears next to the stock quantity.
  - No console errors.
- Confirm `/stock-operations` still loads from the side nav.
