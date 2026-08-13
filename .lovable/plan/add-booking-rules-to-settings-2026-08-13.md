# Add "Booking rules" to Settings

## What is actually there today

Settings has two booking pages and no rules page:

- `/settings/services` (`src/routes/settings.services.tsx`) — service list, default fees, "ask what the booking is for", allow typed-in service.
- `/settings/booking-slip` (`src/routes/settings.booking-slip.tsx`) — terms wording and the signature block.

`/settings/rules` (`src/lib/pos-rules.ts`, `RULE_GROUPS`) covers shift, shift close, discounts, inventory/refunds, terminal security and manager PIN gates — there is **no booking group at all**. So nothing controls deposits, ready-by times, job tags, cancellations or who may edit racket specs, and the racket/string master lists the register reads (`integrations.racketModels` / `stringModels`) have no editor anywhere, which is why the pickers look empty.

## Changes

### 1. New settings page: Booking rules (`/settings/booking-rules`)
Listed in the hub under "Business & pricing", next to POS rules. Sections:

**Deposits & payment**
- Require a deposit on every booking (on/off)
- Minimum deposit — percent of the booking total, or a flat amount
- Allowed payment timings: pay now / part deposit / pay on collection
- Block collection while a balance is outstanding

**Scheduling**
- Default turnaround (hours or days) used to pre-fill the ready-by date
- Require a ready-by date and time
- Warn when a promised time falls outside trading hours

**Racket / stringing jobs**
- Auto-generate a job tag on every racket booking (on/off)
- Default tension unit (lb / kg) and default main / cross tension
- Require racket model and string type before saving
- Racket master list and string master list — editable lists that feed the register's brand/model and string pickers

**Control**
- Manager PIN to cancel a booking
- Manager PIN to edit specs after a deposit has been taken
- Auto-cancel uncollected bookings after N days (0 = never)

### 2. Enforce them where bookings are raised
The register intake dialog and `/bookings` read these values: deposit minimum validated before save, ready-by pre-filled from the default turnaround, tension defaults applied, job tag generated when enabled, and the PIN gates hooked into the existing manager-override dialog.

## Technical notes

- Store the settings as a `bookingRules` block inside `pos_settings.integration_settings` (typed on `IntegrationSettings` in `src/lib/pos-types.ts`) with a `DEFAULT_BOOKING_RULES` constant — no migration needed, and branch overrides work automatically through the existing settings-section machinery.
- New route `src/routes/settings.booking-rules.tsx` built with `SettingsFrame` / `SettingsSection`, saving via `updateSettings`, matching the pattern in `settings.services.tsx`.
- Register the page in `src/routes/settings.index.tsx` (business group) and expose the master lists to `src/routes/index.tsx`, which already reads `integrations.racketModels` and `integrations.stringModels`.
- PIN gates reuse `ManagerOverrideDialog`; no new permission flags beyond the existing `can_cancel_booking` / `can_create_booking`.
