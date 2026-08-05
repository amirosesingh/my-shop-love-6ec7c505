# Typed-only cash drawer reason

Replace the dropdown in the "Open cash drawer" dialog with a required free-text reason box, and make sure every manual open is stored in the database with the exact typed text, the time it happened, and who did it.

## Behaviour

- Clicking "Open cash drawer" opens the dialog with an empty reason field focused.
- The reason must be typed: minimum 3 characters after trimming, maximum 200. The confirm button stays disabled until valid, with an inline hint.
- No preset options, no dropdown. The optional note field stays as-is.
- Permission/supervisor-approval flow is unchanged: confirming still requires `can_no_sale_open` or an override, and the approver is recorded.
- After a successful open the field resets so the next open cannot silently reuse the previous text.

## Storage

Each open already writes a row to the `drawer_events` table; it will now carry the typed sentence instead of a fixed code, alongside the existing timestamp, staff id/name, role, store, terminal, shift and approver. The activity log entry records the same typed text.

## Technical details

- `src/lib/drawer-events.ts`: drop the `NoSaleReason` union, `NO_SALE_REASONS` and `NO_SALE_LABELS`; `reason` becomes `string`. `recordNoSale` trims the reason and logs it verbatim.
- `src/routes/index.tsx`: swap the `<select>` for an `<Input>` (or short textarea) with validation state; update the confirm handler and reset logic.
- `src/routes/dashboard.tsx`: render `d.reason` directly (label lookup removed).
- No migration needed — `drawer_events.reason` is already a free-form text column and the insert policy stays as is. Existing historical rows keep their old codes and will display as the stored value.
