# System & Settings navigation, themed dropdowns, light/dark mode

## 1. Every settings area gets its own sidebar entry

The sidebar's "System & Settings" group only lists Tax & Pricing, Receipt / Print Customizer and Point Rules, while the Settings page itself now holds many more sections. Expand the group so each section is directly clickable:

- Display & text size
- Tax & pricing
- Business identity
- Receipt typography
- Extra lines
- QR code
- Receipt elements
- Bank transfer details
- WhatsApp bills
- Sync & backup
- Point rules (stays pointed at Promotions)

Clicking any entry opens the Settings page with that one section already expanded and scrolled into view; everything else stays collapsed. The section is remembered in the page address, so the entries also work as bookmarks and the sidebar highlights the active one.

The "Editing branch" selector and the "Apply to printers" button stay at the top/bottom of the receipt area since they apply across sections, and the "Preview receipt" button remains in the page header.

## 2. Dropdowns follow the theme

Several dropdowns are plain browser selects, so their popup list renders white with dark text regardless of theme (Settings: branch, font family, line placement, QR placement; Promotions: 2; Members: 1). Replace them all with the app's themed Select component so the popup uses the surface/foreground tokens, matching the rest of the UI in both themes.

## 3. Light and dark mode

Today there is a single palette on `:root` (dark) plus a leftover `.dark` block using a different, unrelated colour set — so no real theme switching exists.

- Rebuild the palette: `:root` becomes the light theme (light surfaces, dark text, same amber primary and teal accent), `.dark` becomes the current dark POS palette, both using the same token names so no component changes are needed.
- Add a theme provider that stores the choice per terminal (System / Light / Dark) and applies the `dark` class on the document element, defaulting to the operating-system preference.
- Add a sun/moon toggle in the app header next to the sync status, and a Theme control inside the new Display & text size settings section.
- Sweep for hardcoded colour classes in POS screens (e.g. white receipt preview surfaces) and keep the printed-receipt preview intentionally white, since paper is white in both themes.

## Technical notes

- `src/components/pos/nav-config.ts`: add the system items with `search: { section: "<id>" }`; `navItemKey` already keys on hash — extend it to key on the section param.
- `src/routes/settings.tsx`: make the `Accordion` controlled from the `section` search param (validated via `validateSearch`), scroll the open item into view on mount, and update the param when the user opens another section.
- `src/components/pos/SidebarNav.tsx`: active-state comparison must include the section param.
- New `src/lib/theme.tsx`: small provider + `useTheme` hook (localStorage `pos.theme`, `matchMedia` for system), mounted in `src/routes/__root.tsx`; the class is applied before paint to avoid a flash.
- `src/styles.css`: swap the `:root` / `.dark` blocks to a real light/dark pair in oklch; keep `@theme inline` mappings unchanged.
