# Settings consolidation, display scaling, readable audit categories

## 1. One settings page, one thing at a time

Today the Receipt customizer sits in a narrow left column with the live receipt preview pinned beside it, and eight tabs (Identity, Typography, Extra lines, QR code, Elements, Bank transfer, WhatsApp bills, Sync & backup) are crammed into that half-width column. On a 1200px screen the tab strip wraps and forms get clipped.

Change to a single full-width column:

- Remove the side-by-side `1fr / 340px` split. Every settings group gets the whole page width.
- Replace the wrapped tab strip with a vertical accordion list of collapsible sections, one open at a time: Business identity, Receipt typography, Extra lines, QR code, Receipt elements, Bank transfer details, WhatsApp bills, Sync & backup, plus the existing Tax and Membership tiers groups.
- The live receipt preview stops being always-on. A "Preview receipt" button in the sticky page header opens it in a right-side sheet at full paper width, so the format is never squeezed. Closing the sheet unmounts it.
- Sections keep their current fields and save behaviour; only layout and containment change.

## 2. New "Display & scaling" section

A dedicated settings group for on-screen sizing:

- Mode: Automatic (current viewport-derived scale) or Manual.
- Manual scale slider from 85% to 150% with a live sample row (button + text) rendered at the chosen size.
- Optional density toggle: Comfortable / Compact (control heights).
- Saved per terminal in local storage, applied by writing `--pos-scale` on the document root so the register, settings, and every other screen follow it.

## 3. Human-readable audit categories

`src/lib/audit-log.ts` already maps every category to a friendly label ("Moving around the app", "Screen interaction", etc.), but the Audit screen prints the raw value in three places: the timeline badge, the table Category column, and the detail drawer row. Switch all three to the existing `categoryLabel()` helper so no `navigation` / `interaction` strings remain visible. CSV export already uses the labels.

## Technical notes

- `src/routes/settings.tsx`: swap `Tabs` for `Accordion` (shadcn component already present), drop the grid split, move preview iframe into `Sheet`.
- `src/lib/use-ui-scale.ts`: extend to read a stored preference (`auto` vs a manual multiplier) and expose a setter; keep the existing auto computation as the default branch.
- `src/styles.css`: apply the `.pos-scaled` sizing rules to the app shell so the preference affects the whole app, add a compact-density variant.
- `src/routes/audit.tsx`: use `categoryLabel(l.category)` at lines rendering the badge, table cell, and detail row.
