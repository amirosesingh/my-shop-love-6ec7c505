# Full-screen canvas, micro-sized buttons, and custom action buttons

Turn the register canvas into a true full-bleed workspace, make every node shrink tightly around its content, and let admins create their own buttons wired to any page, modal, or action in the software.

## What exists today

- `RegisterWorkspace.tsx` renders a `react-grid-layout` Responsive canvas (24 cols, rowHeight 20, margin 6) inside `ZoomCanvas` inside `AppShell`'s scrolling `<main>`. Nodes are `<section>` wrappers; only tone, font, label, view and display style are configurable.
- `register-layout.ts` stores `{i,x,y,w,h,view,font,tone,style,label}` per terminal in localStorage (`v2`), where `i` must be one of the fixed `RegisterModuleId` union in `register-modules.ts`.
- `ActionButton.tsx` forces `h-auto min-h-10 w-full px-2 py-2` and reads label/display style from `useNodeOptions()`.
- Every till modal (coupon, split, pay, no-sale/drawer, open shift, voucher picker, product search) is local state inside the 3300-line `src/routes/index.tsx`; pages like Suppliers, Holds, Bookings, Customers, Display are separate routes reached by `useNavigate`.

## Plan

### 1. Full-screen canvas
- The register renders the workspace as `flex-1 h-full w-full` with no outer padding; the canvas container becomes `h-full w-full overflow-auto` with no margin and no max-width.
- The customize toolbar collapses to a floating overlay chip (top-right) instead of a fixed bar, so live mode gives 100% of the height to the till.
- The grid keeps 24 columns but measures live width, and row height is derived from the container height so the layout stretches to any monitor resolution instead of leaving dead space at the bottom.
- Grid margins drop to zero; spacing comes from each node's own padding setting.

### 2. Micro-sizing, icon-only and auto padding
- New per-node option `pad` (px, default 5), stored in the layout JSON and applied as inline padding on the node body.
- Minimum sizes for button/badge modules drop to 1x1 grid units so an icon-only tile can shrink to a single cell.
- `ActionButton` loses its fixed min-height and padding; in icon-only mode it renders a square icon that fills the box with no leftover whitespace.
- Auto-scaling content: each node observes its own box and computes icon and font size from `min(width, height) - 2 * pad`, clamped to sane bounds, so content always fills the space inside the padding boundary.
- Inspector gains a padding control (0-16px) plus a default padding setting in the customize bar.

### 3. Custom buttons and the action registry
- New `src/lib/register-actions.tsx`: a provider mounted at the register root exposing every till action and page target by id — cart focus, barcode lookup, fast cash, live receipt, book & pay later, hold/park list, voided tickets, close shift, customer display toggle, clock in/out, drawer eject, customer directory, add customer, supplier page, product search, stock adjustment, exchange/returns. Page targets navigate; modal targets call the existing state setters; till actions call the existing handlers.
- Feature Hub gains `+ Create new action button`, opening a properties drawer: title, display mode, padding, icon picker (curated POS icon set), colour theme (presets plus hex), and target action dropdown grouped by the categories above.
- Layout ids become `RegisterModuleId | "custom:<id>"`. Custom nodes carry `{label, icon, action, color, displayMode, pad}` in the layout JSON and are rendered by the workspace through the action registry rather than the route's slots map. The sanitiser validates icon names, hex colours and known action ids, dropping anything unknown.

### 4. Decoupling buttons from functionality
- All modal state, hotkeys and handlers move behind the provider in step 3, registered once at the register root. Removing a button only removes a node from the layout; the handler, hotkey and modal stay alive and can be re-triggered by a re-added button or a hotkey.
- Keyboard shortcuts are registered centrally in one listener, so they keep working even with an empty canvas.

### 5. Persistence and polish
- Layout schema bumps to `v3` with a one-shot migration from `v2` (adds `pad: 5`, keeps existing coordinates). Same per-terminal storage and the same Save / Live preview / Factory default flow.
- Drag and resize snapping stay; edit mode keeps the dot grid and per-node toolbar, live mode renders borderless.
- Custom buttons still respect permission gates: a target the signed-in role cannot use renders disabled with the reason, so placement never grants access.

## Technical notes

- No new dependency; `react-grid-layout` and lucide are already installed.
- Colour presets use semantic tokens; a hex override is written as an inline CSS variable on that node only, never a hardcoded colour class.
- Order of work: canvas sizing -> padding and auto-scale plus icon-only shrink -> actions provider and decoupling -> custom button creator -> v3 schema and migration.