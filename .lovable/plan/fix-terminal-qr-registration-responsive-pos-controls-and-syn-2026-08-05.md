# Fix terminal QR registration, responsive POS controls, and sync auditing

## Goal

Make phone-to-PC terminal pairing reliable, keep every register action readable and tappable on small screens, and verify that important POS changes reach the backend and appear in the audit trail.

## Confirmed findings

- The PC activation flow expects terminal status to include `location_id`, but the current `terminal_token_status` database function returns only status and location name. This breaks QR verification after scanning.
- The register still contains several raw text buttons. The line-item and bill-level discount controls do not consistently use the adaptive icon button.
- The live backend has the main sales, inventory, booking, transfer, drawer, shift, settings, and audit structures with authenticated access policies. Current business tables checked contain no rows, while the audit table contains only page-view events, so write paths need runtime verification.

## Implementation

### 1. Repair phone-to-PC QR pairing

- Add a forward migration that updates `terminal_token_status` to return `location_id` with status and location name.
- Keep token approval authenticated and preserve the existing claim-once activation flow.
- Harden the client pairing path so an incomplete or expired response shows a specific recoverable message instead of opening the global “clear cache / retry” error screen.
- Validate the full flow: PC displays QR → phone scans and approves a location → PC polling claims the token → activation completes.

### 2. Make register controls responsive and icon-first

- Strengthen `ActionButton` so its icon always remains visible, labels collapse only when space is limited, touch targets remain at least 44px, and long-press/hover exposes the label.
- Convert both Add discount controls to adaptive buttons with a percent icon: icon-only on compact screens and icon plus label when space permits.
- Convert remaining register action buttons that can overflow—charge/refund, booking, receipt actions, coupon removal, kitchen print, and held-order actions—to the same icon-aware pattern where appropriate.
- Replace fragile flex rows with responsive grid/min-width constraints so cart text, totals, actions, and the right operation deck cannot overlap.
- Check the POS at narrow phone, tablet, and Windows widths, including long product names and active discounts.

### 3. Verify backend sync and audit coverage

- Trace and exercise representative writes for sales/exchanges/discounts, holds/voids/cancellations, payment corrections, receipt actions, drawer opens, shifts, inventory, purchase orders, transfers, bookings, staff changes, and settings.
- Confirm each persistent business action writes to its intended backend table and each auditable action creates a human-readable audit entry with actor, module, target, timestamp, and meaningful metadata.
- Add missing audit calls only for uncovered state-changing actions; keep global button telemetry separate from business audit records so routine clicks do not obscure operational history.
- Surface failed backend writes to the operator and retain the existing desktop offline queue, while keeping Android live-only with no local business cache.

## Technical details

- Add a new migration rather than rewriting previously deployed schema history.
- Update the database function return signature and client response parsing together.
- Reuse the existing `ActionButton`, Lucide icons, audit logger, sync outbox, and backend client rather than introducing parallel systems.
- Run focused tests plus browser checks at 390px, 768px, and desktop widths; verify pairing and representative records against the backend after each action.

## Completion criteria

- A phone scan can approve and activate a PC without a global crash or cache-reset prompt.
- Discount controls always show a percent icon and never overlap neighboring cart content.
- Compact screens show recognizable icons with accessible labels/tooltips; larger screens show icon plus text.
- Representative business writes can be found in their backend tables and their matching operational audit entries can be found in the audit log.