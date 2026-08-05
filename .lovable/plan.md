# Terminal activation fix, non-overlapping till buttons, shift gating and stringing bookings

## 1. "Could not find the platform column of terminal_tokens"

Terminal registration writes to your own POS database, and that database's
`terminal_tokens` table does not yet have the `platform` column that separates
PC tills from mobile terminals (the managed backend does have it).

- Add `supabase/schema25.sql` that adds the missing `platform` column (default
  `pc`) plus the pairing columns, and refreshes the API cache. You run it once
  on your POS database, the same way as the earlier schema files.
- Make the app resilient in the meantime: when issuing, re-issuing or listing
  tokens, if the database reports the column as unknown, retry without it and
  treat those rows as PC terminals. Registration then works on both an updated
  and an older database instead of failing outright.
- Mobile terminal registration uses the same fallback, so the Android pairing
  screen stops erroring.

## 2. Buttons overlapping / unclickable in the register

The action buttons decide whether to show their text from the *screen* width,
not from the width of the panel they sit in. In the narrow cart column the
labels stay on, so they run into each other and into neighbouring controls, and
the semi-transparent overlap swallows clicks.

- Switch the action button to size itself from its own container: icon-only
  when the panel is narrow, icon + label when there is room, and allow a
  two-line label instead of clipping.
- Give every toolbar cell a proper minimum width and consistent height so
  buttons wrap onto a second row rather than sliding over each other. Applies
  to the transaction actions, payment execution, and device & printing groups,
  plus the cart line controls.
- Remove the stray transparency so nothing sits invisibly on top of a button.

## 3. Everything locked while the shift is closed

Today the register is frozen for cashiers, but coupon, exchange, cash-drawer and
similar actions stay live for admins and supervisors.

- With no open shift, all till actions are disabled for everyone, including
  bypass accounts: apply coupon, exchange, hold, void, refund, book & pay later,
  payment execution, manual drawer open and receipt reprint.
- Disabled buttons show a short reason on hover/long-press ("Open a shift
  first") so it is obvious why they cannot be pressed.
- Opening the shift, signing out, settings and inventory stay available.

## 4. Book & pay later — stringing jobs vs ordinary items

- Booking services settings gain a "Racket / stringing job" switch per service.
- In the Book & pay later dialog, choosing a service with that switch on opens
  the racket job card automatically (model, string, tension, promised date,
  notes) and does not require cart items.
- Choosing any other service, or no service, requires at least one item punched
  into the cart before the booking can be saved, with a clear message if the
  cart is empty.
- The job tag keeps printing only for stringing jobs.

## Technical notes

- New file `supabase/schema25.sql`: `ALTER TABLE public.terminal_tokens ADD
  COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'pc'` (plus
  `claimed_by_device`, `claimed_at` guards) and `NOTIFY pgrst, 'reload schema'`.
- `src/lib/terminal-tokens.ts`: detect PostgREST error code `PGRST204` /
  "column ... does not exist" and retry the insert/update without `platform`;
  `rowToToken` already defaults to `pc`.
- `src/components/pos/ActionButton.tsx`: replace the `sm:` label breakpoint with
  Tailwind container queries (`@container` on the toolbar wrappers,
  `@[9rem]:inline` on the label), keep `min-w-0`, drop `overflow-hidden`
  clipping in favour of `line-clamp-2`.
- `src/routes/index.tsx`: single `tillLocked = !activeShift` flag feeding
  `disabled` on every action in the operation deck, cart line controls and
  payment row; grid cells get `min-w-0` and `auto-rows-fr`.
- `src/lib/pos-types.ts`: `BookingServiceType` gains `isStringingJob?: boolean`;
  `src/routes/settings.services.tsx` gains the switch;
  booking dialog derives `jobOpen` from the selected service and validates the
  cart for non-job bookings.
