# Sidebar: groups only, options live on the hub page

The sidebar becomes a short list of section names. No sub-items underneath any of them.

## What changes

- Each group (Sales & Operations, Inventory & Supplies, Customers & Marketing, Stock Admin, Reports & Analytics, System & Settings) renders as a single row with its icon and name.
- Clicking a row opens that section's hub page, where every option in the group is shown as a card — same hub pages already in place.
- The register ("/") stays directly reachable so the till is always one click away.
- Menu search still works: typing a term surfaces matching individual options as a flat result list, so nothing becomes unreachable.
- Active state: the group row highlights when you are anywhere inside that section.
- Collapsed icon-only sidebar keeps its hover flyout with the full item list, unchanged.

## Technical notes

`src/components/pos/SidebarNav.tsx`: in the expanded (non-collapsed) branch, stop rendering the indented `g.items` list and the bordered container; render only the `Link to={g.hubTo}` row, restyled from a small uppercase label into a normal nav row (icon + label, same size/hover as current items). Keep the `inbound` transfers badge by surfacing it on the group row that contains `/transfers`. When `query` is non-empty, render the flat matched-item list using the existing `ItemLink` instead of group rows.
