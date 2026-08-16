# Canvas display fixes + booking refactor

Picks up the two phases left from the last round: the layout editor's font-size and
"icon + text" controls, and the booking screens.

## 1. Layout editor: font size and display switcher

Today the per-node font size only takes effect on borderless (icon-style) tiles —
panel tiles such as the cart, catalogue and totals silently ignore the setting.
The "icon / text / icon + text" switcher is also only honoured by action buttons;
every other node ignores it.

- Apply the font-size scale to every node, panel tiles included, instead of only
  bare tiles. Panel tiles get a text scale driven off the chosen size rather than
  the shrink-to-fit measurement used for icon tiles, so a cart at "XL" simply reads
  larger without breaking its scroll area.
- Feed the scale in as CSS variables the node content inherits, and have list/table
  content inside panels read that variable so rows, headings and totals follow the
  setting.
- Make the display switcher meaningful for panel tiles too: hide/show the node's
  icon and caption according to the choice, and only offer the switcher on nodes
  that can actually honour it (the inspector currently shows it everywhere).
- Verify in the running preview: set a panel tile to XL and to icon-only, and
  confirm both the editor and the live register reflect it after saving.

## 2. Booking system refactor

**Standard (goods) booking**
- Add a deposit breakdown to the booking dialog: total, minimum deposit required by
  the branch rules, amount being paid now, and the balance due on collection —
  recalculating as the cashier types.
- Block confirmation when the deposit entered is below the branch minimum, with a
  clear inline message rather than a generic toast.
- Add terms & conditions acceptance to the standard flow, mirroring the racket flow:
  when booking terms are configured, the customer must accept before the booking can
  be stored, and the acceptance is saved with the booking.

**Racket / stringing booking**
- Collapse the intake into a single-column layout so it reads top to bottom
  (customer → racket → tension → charges → terms) instead of the current two-column
  split, which is cramped at till width.
- Group the intake into clear titled sections with the summary/charges total pinned
  at the bottom of the dialog so it stays visible while scrolling.

**Manage bookings screen**
- Replace the single flat list with tabs: Racket jobs, Standard bookings, and
  Completed / collected, each with its own count badge.
- Keep the existing pay, incident and delete dialogs working unchanged inside the
  tabs.

## Technical notes

- Canvas work is in `src/components/pos/layout/RegisterWorkspace.tsx`
  (`useAutoScale`, `CanvasItem`, `Inspector`) plus `node-options.tsx` and
  `ActionButton.tsx`; `ModuleFont` / `ModuleStyle` already exist in
  `src/lib/register-layout.ts`, so no storage-shape change is needed.
- The booking dialogs live inline in `src/routes/index.tsx`. The racket single-column
  and standard-deposit sections are extracted into components under
  `src/components/pos/booking/` to keep that route from growing further.
- `liability_accepted` and `charges` already exist on `bookings`, so standard-booking
  T&C acceptance reuses `liabilityAccepted` — no database migration required.
- Tabs on `src/routes/bookings.tsx` are presentation only; data loading stays as is.
