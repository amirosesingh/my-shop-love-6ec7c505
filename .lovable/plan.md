# Sidebar: always-open groups, no dropdown

Every sidebar group shows its items all the time. No chevron, no collapsing.

## What changes

- Remove the chevron toggle button from each group header. The header becomes a single clickable row that opens that section's hub page.
- All items under every group are always visible; the expand/collapse animation and the saved open/closed state go away.
- The active group and active item keep their current highlight, and menu search keeps working (it filters items in place).
- The narrow icon-only sidebar is untouched: hovering a group icon still opens its flyout with the full item list.

## Technical notes

`src/components/pos/SidebarNav.tsx`: drop the `open` state, `toggleGroup`, the `OPEN_KEY` localStorage read/write, the `expanded` grid animation wrapper, and the `ChevronDown` import/button. Render `g.items` directly inside the indented list container. The group header stays a `Link to={g.hubTo}` with no extra state update on click.