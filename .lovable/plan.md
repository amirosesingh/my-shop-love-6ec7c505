# Repair central database requests and settings inheritance

## Goal
Remove the missing-API-key response, the `stores` 403 requests, and the `settings_effective` permission failure without weakening row security.

## Implementation

1. **Fix external database request headers**
   - Correct the external client wrapper so every database request includes the configured publishable `apikey`.
   - Preserve the signed-in user token as a separate `Authorization: Bearer <user token>` header.
   - Never send the opaque publishable key as a bearer token, and keep all service credentials server-only.

2. **Move protected store operations behind the existing proven relay**
   - Add an authenticated/activated-terminal relay read for the branch list.
   - Replace direct browser `stores` reads during POS startup with the relay read.
   - Route store create, update, delete, and terminal-location mirroring through the relay instead of first making a request expected to fail under row security.
   - Retain caller verification and the store table allow-list on the relay.

3. **Correct settings hierarchy identity propagation**
   - Call `settings_effective`, settings save, and batch sync with the already verified staff access token rather than service or anonymous identity.
   - Ensure server-side external RPC requests include both the publishable `apikey` and the validated staff bearer token.
   - Stop silently retrying privileged settings calls anonymously; keep shipped defaults only for genuine offline/unavailable states.

4. **Add an idempotent central-database repair script**
   - Restore the minimum grants required for `stores`, scoped settings, staff-role lookup, and server relay access.
   - Grant settings routine execution only to intended signed-in/service roles; visitors remain unable to call privileged settings routines.
   - Backfill linked active admins/managers/staff into the separate `user_roles` table so existing email accounts satisfy staff policies, without trusting client-supplied roles.
   - Keep row security enabled and preserve staff/branch policy checks.

5. **Improve diagnostics and retry behavior**
   - Avoid repeatedly issuing a direct request after a table has been refused during the current browser session.
   - Report header/configuration, identity, row-policy, and relay failures distinctly without exposing credentials.

## Verification

- Inspect outgoing signed-in requests and confirm the publishable `apikey` and user bearer token are both present in their correct roles.
- Test admin/supervisor branch list, branch create/edit, terminal location synchronization, and POS startup; confirm no `stores` 403s remain.
- Load, edit, save, and refresh Global, Cluster, and Branch settings; confirm inheritance and overrides persist.
- Test an anonymous browser and confirm store mutations and privileged settings calls remain denied.
- Run focused tests/type checks and inspect final console/network output.
- Report central-database runtime verification separately; if its repair SQL has not been applied, mark that path unverified.

## Technical notes

- The failing requests target the separately configured central POS database, so its access repair must remain repeatable SQL for that database.
- No private key will be placed in frontend code or committed files.