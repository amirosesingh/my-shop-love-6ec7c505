# Atomic Register Canvas

Break the till screen down from eight coarse blocks into ~30 individual draggable elements on one seamless canvas, with per-element styling controls.

## What exists today

- `src/lib/register-modules.ts` lists 8 coarse modules (catalog, billHeader, scanBar, memberSearch, cartLines, billFooter, transactionActions, devicePrinting).
- `src/lib/register-layout.ts` stores `{i,x,y,w,h,view,font}` per terminal in localStorage and exposes `useRegisterLayout`.
- `src/components/pos/layout/RegisterWorkspace.tsx` renders a `react-grid-layout` Responsive grid at rowHeight 28, wraps every module in a bordered card, and shows a diagonal-stripe backdrop in edit mode.
- `src/routes/index.tsx` builds the 8 slot JSX values and passes them as `slots`, plus the untouched `classic` three-column screen as the fallback.

## Plan

### 1. Atomic module registry
Rewrite `register-modules.ts` into the granular catalogue, grouped as requested:

- Action buttons: clear cart, hold order, book & pay later, exchange/return, void line, discount/coupon, split bill, open drawer, print receipt, exact cash, charge/pay, add member, close shift.
- Inputs & displays: barcode input, member search field, bill-number badge, cashier/shift badge, live receipt list, subtotal block, tax block, balance-due XL display.
- Catalog: product search bar, category pills, product grid/list container, racket booking tile.

Each entry keeps id, label, category, default w/h, min sizes, an optional `visibilityKey`, and flags for which style controls apply (`chrome: "bare" | "panel"`, `supportsView`, `supportsLabel`, `supportsTone`).

### 2. Split the register route into atomic slots
`src/routes/index.tsx` currently composes big slot blocks. Each atomic control becomes its own small slot value built from the same handler/state it already uses (`clearCart`, hold, void, charge, etc.), so behaviour is unchanged wherever it lands. The eight legacy ids stay mapped so already-saved layouts keep working; the migration step in the layout reader expands a legacy id into its atomic children on first load.

### 3. Seamless canvas
- Drop the card border/background from `CanvasItem`. Elements marked `chrome: "bare"` (buttons, badges) render their control directly; only list/panel elements keep a surface.
- Live mode: no borders, no stripes — one continuous background.
- Edit mode: subtle dot-grid backdrop (radial-gradient pattern sized to the grid step), dashed outline + floating toolbar per element on hover/selection.
- Grid density raised to `rowHeight: 20`, `margin: [6,6]`, 24 columns so single buttons can be placed precisely.

### 4. Per-element controls
Edit-mode overlay on each node: drag handle, `X` remove (returns it to the hub), resize handles from RGL. Clicking a node opens an inspector popover:
- Custom text label (falls back to the default label).
- Colour tone: neutral / primary / success / warning / destructive — mapped to existing semantic tokens, no hardcoded colours.
- Display style: icon + text, text only, icon only.
- Font size: Small / Medium / Large / Extra Large.
- View grid/list for the product container only.

### 5. Persistence
`LayoutBox` gains `label?`, `tone?`, `style?`, and `font` extends with `xl`. Sanitiser validates the new fields and drops unknown ids. Same per-terminal localStorage key, bumped to `v2` with a one-time migration from `v1` coarse layouts. Save / Live preview / Factory default behave as today; factory default rebuilds the classic three-column arrangement expressed in atomic nodes.

### 6. Safety
- Non-admins never see the bar, hub or handles; edit intents are ignored when `!isAdmin`.
- Every atomic element still respects its `ui-visibility` key and permission gate, so placement can never grant access a role lacks.
- Removing charge / cart list warns that the till can no longer take payment.

## Technical notes

- No new dependency; `react-grid-layout` is already installed.
- Order of work: registry -> atomic slot extraction in the register route -> chrome-less canvas + dot grid -> inspector + style application -> layout v2 schema and migration.
- The `classic` three-column screen stays as the SSR/no-layout fallback and for terminals that never customise.
