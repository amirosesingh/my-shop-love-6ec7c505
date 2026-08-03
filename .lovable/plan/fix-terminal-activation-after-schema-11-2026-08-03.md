# Fix terminal activation after schema 11

## Confirmed cause

The terminal is connecting to the separate POS database embedded in the activation build, not the Lovable Cloud database.

Direct checks against that exact POS endpoint show:

- `terminal_token_status` works — schema 11 was installed successfully.
- `terminal_token_heartbeat` works.
- `terminal_token_claim` returns `PGRST202` because it does not exist.

Activation added the one-time code claim in `schema13.sql`, but the shared error handler mistakes any missing terminal RPC for a missing schema 11 installation. Re-running schema 11 therefore cannot fix this particular failure.

## Fix

1. **Add one standalone activation repair script**
   - Create a safe-to-rerun SQL script containing the complete current terminal activation setup: claim columns, valid token statuses, status lookup, heartbeat, and atomic single-use claim.
   - Include the required function permissions and an API schema-cache reload.
   - Avoid requiring users to determine whether schemas 11, 12, or 13 were previously applied.

2. **Make activation errors name the actual missing helper**
   - Report a missing `terminal_token_claim` as incomplete one-time activation setup rather than telling the operator to rerun schema 11.
   - Keep distinct messages for missing status lookup, real connection failures, invalid/revoked codes, and already-used codes.

3. **Update Windows setup guidance**
   - Replace the schema-11-only repair instruction with the new consolidated activation repair script.
   - Explain that it must be run on the separate POS database used to issue terminal tokens, not the app's Lovable Cloud database.

4. **Verify the real activation path**
   - Recheck all three RPCs against the POS endpoint after the script is applied.
   - Redeem a newly issued code and confirm the claim succeeds once, a second claim is rejected, and heartbeat still works for the claimed terminal.

## Technical scope

- Database repair is limited to terminal activation functions and supporting token columns/constraint; no token rows or other POS data are changed.
- The existing token endpoint and publishable client remain unchanged.
- Until the repair script is applied to the separate POS database, runtime activation verification remains pending.