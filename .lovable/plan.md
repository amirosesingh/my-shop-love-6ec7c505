# Booking hub: make it visible everywhere and fill the master lists

## Audit result

The dual-flow booking hub asked for is already in the code and rendering:

- `src/routes/index.tsx:1991` — permanent `🏸 Create / Manage Booking` button with a live active-booking `Badge`, disabled only when the till is locked (never by an empty cart).
- `src/routes/index.tsx:2920` — chooser modal with Racket service / stringing, Standard / general booking, and a "Manage bookings (n active)" link.
- Racket flow: brand/model + string pickers, main/cross tension, stencil and overgrip toggles, ready-by picker, auto job tag via `newJobTag()` (`src/routes/index.tsx:765, 906`).
- Cart integration: booking lines render spec chips and an `Edit specs` action (`src/routes/index.tsx:1770-1785`) wired to `updateBookingSpecs` in `src/lib/pos-store.tsx:1116`.
- Types are in place: `RacketJob.stencil/overgrip`, `CartLine.job/bookingId`, `IntegrationSettings.racketModels/stringModels`.

Two verified reasons it can still look missing or half-working on a real till:

1. **Custom canvas layouts don't have the button.** `actBooking` was added to the default layout (`src/lib/register-layout.ts:190`), but saved layouts are already at `version: 4`, so a till that saved a layout before this change loads it untouched and never shows the node. Only the classic (non-canvas) column shows it.
2. **The racket/string master lists are empty.** `state.settings.integrations.racketModels` / `stringModels` are read in the register, but no settings screen writes them, so both pickers show no suggestions — it looks like the "master data link" was never built.

## Changes

### 1. Ensure the booking button exists on every saved layout
- Bump the layout schema to `version: 5` with a migration that takes any v4 layout and, if `actBooking` is absent, inserts it next to the existing charge / book-later atoms (or at the top of the bill footer column) without disturbing other nodes.
- Keep everything else in the layout byte-identical so no till loses its customisation.

### 2. Racket & string master lists in settings
- Add a "Racket & string master lists" block to `src/routes/settings.booking-slip.tsx`: two editable tag lists (add / remove entries) saved into `integrations.racketModels` and `integrations.stringModels` through the existing settings patch path — no migration needed.
- Seed sensible defaults on first use (Yonex Astrox / Nanoflare, Victor Thruster, Li-Ning; BG65, BG65 Ti, BG80, BG80 Power, Aerobite, Exbolt 63) so pickers are useful immediately.

### 3. Picker upgrade
- Replace the `datalist` inputs for racket and string with searchable comboboxes (shadcn Command popover) that filter the master list as you type and still accept free text for anything unlisted.

## Technical notes

- `src/lib/register-layout.ts`: `version: 5`, `migrateV4` that appends the `actBooking` item; `sanitise` accepts both versions during read and writes back v5.
- `src/routes/settings.booking-slip.tsx`: new section using the existing `SettingsSection` frame and `updateSettings({ integrations: { ... } })`.
- `src/routes/index.tsx`: swap the two `Input` + `datalist` blocks for a small local `ModelCombobox` component; no change to the booking payload.
- No database or schema changes.
