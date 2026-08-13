# Canvas Layout: Cross-Monitor Scaling, Group Boxes & Platform-Isolated Saving

## What exists today (audited)

- `src/lib/register-layout.ts` — v3 layout schema (`{version:3, items:[{i,x,y,w,h,pad,...}]}`), fixed `GRID_COLS = 24`, `DEFAULT_PAD = 5`, and a `useRegisterLayout(terminal)` hook. Persistence is synchronous `localStorage` only (`pos.register.layout.v3:<terminal>`), with v1/v2 migrations.
- `src/components/pos/layout/RegisterWorkspace.tsx` — renders `react-grid-layout`'s `Responsive` with `useContainerWidth()`, breakpoints `lg/md/sm` and `cols {24,16,8}`, `rowHeight={20}`. Because columns change per breakpoint, the layout *does* reflow between monitors today. `useAutoScale` already sizes icon/text via CSS vars inside the padding box.
- `FeaturePalette.tsx` — a `Sheet` on the **left** side; no group-box tool.
- Electron bridge (`electron/preload.cjs`) already exposes `settings:get` / `settings:set` via `window.pos.getSetting/setSetting`, and `src/lib/local-db.ts` wraps them. `isElectron()` lives in `src/lib/native.ts`. No new IPC channel is required.

## Plan

### 1. Fixed logical canvas + uniform scale engine
- Extend the layout schema to v4: add `canvas: { cols, rowHeight, baseWidth, aspect: '16:9'|'4:3'|'free' }` and `platform_target: 'web'|'electron'`. Migrate v3 → v4 with today's defaults (24 cols, rowHeight 20, baseWidth 1920).
- Replace the `Responsive` grid with the fixed-column `GridLayout`: one column count everywhere, so coordinates never reflow.
- Render the grid at exactly `baseWidth` px inside a wrapper that applies `transform: scale(s)` with `transform-origin: top left`, where `s = containerWidth / baseWidth` (and is also capped by height when an aspect lock is on). A `ResizeObserver` on the outer container recomputes `s` in real time; the outer element reserves `baseHeight * s` so no scrollbars or jumps appear. Result: identical layout, proportionally scaled, from 4K down to a 1024px till.

### 2. Full-bleed canvas + sizing controls
- Remove width caps/padding on the canvas container so the grid spans edge to edge, and drop the drag/resize bounds that stopped items at the far right.
- Add to the edit toolbar: **Total columns** (12/16/20/24 or numeric), **Row height**, and **Aspect ratio lock** (16:9 / 4:3 / Free). Changing columns rescales existing item `x`/`w` proportionally so nothing is lost.

### 3. Right-side drawer + group containers
- Move the Feature hub to `side="right"` as a non-modal overlay (`w-80`, `border-l`, above the canvas) so the grid underneath is never squeezed; the Property Inspector moves into the same drawer.
- Add an **Add Group Box** tool. A group is a node `group:<id>` with a title, rendered as a titled bordered container. Child nodes carry `parent: <groupId>`; dragging the group moves every child by the same delta, and dropping a node inside a group's rectangle docks it (dragging it out un-docks). Deleting a group offers to keep or remove its children.

### 4. Micro-sizing and padding
- Allow `minW/minH = 1` for any node in **Icon only** mode so a button can shrink to a single grid cell; the existing `useAutoScale` already fills the space inside the 5px padding — it will be extended to panels and to the icon-only floor (24px).

### 5. Platform-isolated persistence
- Introduce an async layout store: key `pos.register.layout.v4:<platform>:<terminal>`.
  - Web (`window.pos === undefined`): `localStorage` under the `web` key.
  - Electron: `window.pos.setSetting/getSetting` (existing IPC) under the `electron` key, with a `localStorage` mirror for instant first paint.
- `useRegisterLayout` becomes async-aware (loading flag already present) and stamps `platform_target` on every save; a layout saved for the other platform is never loaded.

## Technical notes
- Files touched: `src/lib/register-layout.ts` (schema v4, canvas config, group model, async platform store), `src/components/pos/layout/RegisterWorkspace.tsx` (scale wrapper, fixed grid, toolbar controls, group rendering/drag), `FeaturePalette.tsx` (right side + group tool), plus a small `src/lib/layout-store.ts` for the web/Electron persistence split.
- No Electron main-process change: `settings:get`/`settings:set` already exist.
- Old v3 layouts keep working through migration; the factory layout is unchanged.
