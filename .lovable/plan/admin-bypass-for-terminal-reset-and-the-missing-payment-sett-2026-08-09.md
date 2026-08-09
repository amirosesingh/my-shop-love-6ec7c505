# Admin bypass for terminal reset, and the missing payment settings column

## 1. Admin never sees a PIN prompt for terminal reset

The "Unpair / reset terminal" card (`src/components/pos/UnpairTerminal.tsx`) renders the Manager PIN dialog directly, so it prompts everybody — including administrators. It never asks the shared authorisation path.

- Route the action through the existing single authorisation path (`useManagerGate`), which already resolves: rule toggle off -> run immediately; admin -> run and record an auto-approved override; anyone else -> Manager PIN dialog.
- Add terminal reset as a proper gate action with its own "Require Manager PIN" toggle, so it follows the same branch rules as refunds and voids.
- Same behaviour on Web, Windows and Android: the card is shared code, so one change covers all three shells; the button executes the reset straight away for admins.

## 2. Backend accepts the admin's own token, no PIN payload

- Ensure the reset/revoke server path accepts either a signed manager grant or a verified administrator session token, and that admin calls carry no PIN. Missing or rejected authorisation still fails closed.
- Every reset is written to the audit trail either way, marked "auto-approved (admin)" when no PIN was asked.

## 3. Sweep the other admin-level actions

Audit the remaining places that open the PIN dialog directly instead of going through the shared gate, and convert them, so administrators are never prompted anywhere.

## 4. "Could not find the 'payment_details' column of 'pos_settings'"

Confirmed: the app writes `payment_details` (bank transfer details) and `whatsapp_settings` to `pos_settings`, but the connected database's `pos_settings` table has neither column — the `schema7.sql` / `schema8.sql` files that add them were never run there.

- Ship one idempotent SQL file that adds both columns and refreshes the API schema cache, for you to run once against your database. Nothing is dropped.
- Make the settings save resilient: if the database reports an unknown column, the app retries without it so the rest of the settings still save, with one clear warning instead of a failed save.

## Technical notes

- `src/lib/pos-rules.ts`: extend `GateAction` / `GATE_RULE_KEY` with `terminal_unpair`, default rule ON.
- `src/components/pos/UnpairTerminal.tsx`: drop the local `ManagerOverrideDialog` and call `useManagerGate().authorize(...)`; pass the returned grant token to the reset call.
- `src/lib/pos-rules.server.ts` and the terminal token relay: accept an admin session token in place of a manager grant, and log the override.
- `src/lib/pos-db.ts`: wrap the `pos_settings` upsert with an unknown-column fallback (PostgREST `PGRST204`).
- New `supabase/schema27.sql`: `add column if not exists payment_details jsonb`, `whatsapp_settings jsonb`, then `notify pgrst, 'reload schema'`.