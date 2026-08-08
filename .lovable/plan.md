# Repair central store access and settings inheritance

## Goal
Remove the reported `403 Forbidden` store requests and restore the Global → Cluster → Branch settings hierarchy without weakening row security.

## Implementation

1. **Route store access through the proven server relay**
   - Add an authenticated/terminal-proven relay read for the branch list.
   - Replace the direct browser `stores` read used during POS startup with that relay read.
   - Send store create/update/delete operations directly through the relay when a staff or activated-terminal identity is available, instead of deliberately triggering a denied browser request first.
   - Update terminal location mirroring to use the same protected path so activation/admin screens do not generate duplicate 403s.

2. **Correct settings hierarchy authentication**
   - Change scoped-settings RPC calls to use the already verified supervisor/staff access token, so `settings_effective`, `settings_upsert`, and batch sync run with the caller identity expected by their database checks.
   - Do not silently retry privileged settings calls as an anonymous request.
   - Preserve shipped defaults only for genuine offline/unavailable states and surface a precise access error otherwise.

3. **Add an idempotent central-database repair script**
   - Restore the minimum table grants required for `stores`, scoped settings, staff-role lookup, and service relay operations.
   - Restore function execution only for the intended roles; keep visitors unable to call privileged settings routines.
   - Backfill linked, active email-authenticated staff into the separate `user_roles` table so existing admins/managers satisfy staff policies, without trusting client-supplied roles.
   - Keep RLS enabled and retain branch/staff policy checks.

4. **Improve failure handling**
   - Remember access-refused tables for the browser session and avoid repeating known-denied direct requests.
   - Log both identity verification and relay/database failures clearly in diagnostics, without exposing credentials.

## Verification

- Test signed-in admin/supervisor branch list, branch create/edit, and POS startup; confirm no direct external `stores` 403 requests appear.
- Load, edit, save, and refresh Global, Cluster, and Branch settings; confirm inherited values and overrides persist.
- Test an anonymous browser and confirm privileged settings writes and store mutations remain denied.
- Run focused tests/type checks and inspect the final network/console output.
- Report external central-database verification separately; if the repair script has not been applied there, mark that database path as unverified rather than claiming completion.

## Technical notes

- The failing database is the separately configured central POS database, not the app’s managed backend, so its grant repair must be retained as repeatable SQL for that database.
- Service credentials remain server-only; no key or privileged header will be added to browser code.