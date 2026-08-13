# Register Screen Customization Mode

Turn the fixed 3-column register into an admin-editable canvas: a categorized feature palette, drag-and-drop grid placement, resize, remove, per-terminal saved layouts, and a live preview before locking it in.

## What exists today

- `src/routes/index.tsx` is one 3183-line `Register` component with a hardcoded three-column shell (catalog | bill | payment deck), Excel-style width drag via `ColumnResizer` + `usePanelWidth`.
- `src/lib/ui-visibility.ts` already lets admins hide named register elements (`register.transactionActions`, `register.paymentExecution`, `register.exchange`, `register.coupon`, `register.splitBill`, ...). The new layout system reuses these keys so hiding and placement stay consistent.
- Admin state comes from `useAuth()` (`isAdmin`, role) in `src/lib/pos-auth.tsx`; branch/terminal context comes from `usePos()`.

## Approach

### 1. Module registry (the Feature Hub source of truth)
New `src/lib/register-modules.tsx`: one entry per POS control with `id`, `label`, `category`, default grid box (`w`/`h`, min sizes), optional `visibilityKey`, and a `render(ctx)` that receives the existing register context object. Categories: Sales & Cart, Transaction Actions, Catalog & Search, Customer & Staff, plus System (clock, shift banner, connection pill).

Modules covered: cart/live receipt, scanner bar, fast-cash touchpad, totals breakdown, charge button, book & pay later, hold/park, exchange, void, coupon, split bill, open drawer, clear cart, product search, category pills, product catalog (grid/list), racket booking, member search, add member, customer display trigger, close shift, staff status header.

### 2. Extract register internals into slot components
`src/routes/index.tsx` shrinks to: state + handlers -> a `RegisterContext` value -> `<RegisterCanvas />`. Each block of current JSX moves into `src/components/pos/modules/*.tsx` and consumes the context, so all existing click handlers, permission gates and state bindings keep working unchanged wherever a module is placed.

### 3. Canvas
`react-grid-layout` (responsive, 12-col, draggable + resizable, `isDraggable`/`isResizable` bound to edit mode). Read-only mode renders the same grid with handles off, so what admins arrange is exactly what cashiers get.

### 4. Edit mode + palette drawer
`src/components/pos/layout/CustomizeBar.tsx` and `FeaturePalette.tsx`:
- Toolbar shown only when `isAdmin`: Customize Layout toggle, Live Preview Demo, Save Layout for Terminal, Reset to Factory Default.
- Side drawer lists unplaced modules grouped by category; drag onto the canvas drops it at the pointer with default coordinates (react-grid-layout droppable item).
- Each placed module gets a dashed outline, drag handle and a red Remove button in edit mode; removing returns it to the palette.
- Blue dashed drop-zone placeholder while dragging.
- Per-module options popover: Product Catalog switches Grid/List view and Small/Medium/Large font; other modules expose font size only.

### 5. Persistence
`src/lib/register-layout.ts` holds the layout JSON (`{ version, items: [{id, x, y, w, h, opts}] }`):
- Immediate save to `localStorage` keyed by terminal id (so each till keeps its own arrangement offline).
- Save Layout for Terminal also writes into the existing `pos_settings.ui_visibility` blob under `registerLayout` through the current settings save path, so the branch keeps it after reinstall. No new table or migration.
- Reset restores the factory 3-column preset defined in code.
- Live Preview Demo keeps the draft in memory, disables handles, lets the admin tap real controls, then Save or Discard.

### 6. Safety
- Non-admins never see the toolbar or drawer; the layout hook ignores edit intents when `!isAdmin`, and the saved-layout read path is the only thing they touch.
- Unknown/removed module ids in a stored layout are skipped; required modules (cart, charge) are restored by Reset and warned about if removed.
- Modules still respect `ui-visibility` and permission gates, so placement can never grant access a role lacks.

## Technical notes

- New dependency: `react-grid-layout` (+ its CSS imported in `src/styles.css`).
- Grid renders client-side only (`useHydrated`/`ClientOnly`) since it measures widths; SSR falls back to the factory column layout.
- `ColumnResizer`/`usePanelWidth` stay for the classic preset but are bypassed when a custom layout is active.
- Delivered in this order: registry + module extraction -> read-only canvas parity with today's screen -> edit mode, palette, remove/resize -> persistence, preview, reset.