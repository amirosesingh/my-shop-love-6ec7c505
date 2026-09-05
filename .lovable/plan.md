# Fix Supervisor/Admin online login on Electron and Android

## Confirmed cause

The Web app and terminal apps already share the same `login()` implementation and password-authentication client. The failed requests reach authentication and are rejected before staff, role, or POS session mapping runs.

On Electron and Android, startup currently restores the saved cloud URL/key from the device vault and then restores terminal activation. Restoring activation calls `applyTenantOverride()` with the URL/key embedded in the older activation record, resets the cloud client, and overwrites the newer connection profile. The login therefore can target a different authentication project from the one shown/saved in Database & Cloud Connection, producing “Invalid login credentials” even when those credentials work on Web.

## Changes

1. **Make the saved connection profile authoritative at startup**
   - Adjust terminal startup ordering so activation/branch identity is restored first, then the current URL/key from the existing Electron vault or Android Keystore is applied last.
   - Keep activation as the fallback source only when the device has no separately saved connection profile.
   - Do not change terminal identity, branch, company, activation, or the stored connection values.

2. **Guard the existing online login path**
   - Make the existing Supervisor/Admin `login()` await connection-profile hydration before accessing the lazy cloud client.
   - Keep the entered email normalization and `signInWithPassword` call unchanged.
   - Keep successful session, staff, role, permission, and device-session handling unchanged.

3. **Add focused regression coverage**
   - Verify both Electron and Android startup apply the current device-vault profile after an older activation profile.
   - Verify Supervisor/Admin password login cannot call authentication before profile hydration completes.
   - Verify successful authentication still flows into the existing role/session mapping.
   - Run the existing Cashier/PIN and platform-configuration tests to prove local staff login remains independent.
   - Run the existing Emergency Access tests without modifying any Emergency Access source.

4. **Validate supported builds**
   - Run the targeted tests, full test suite, and existing Electron/Android packaging checks.
   - Run the existing own-database/configuration isolation security test to confirm no URL/key fallback or bundled secret was introduced.
   - Bump the application version using the project’s required version script.

## Explicitly unchanged

- Cashier/staff local login, local backend, local database, and offline operation
- Authentication provider, password handling, role verification, permissions, and privileged IPC
- Terminal identity, branch, company, activation, and existing cloud architecture
- Emergency Access code, recovery sessions, expiry, lockout, and authorization
- No hardcoded URL, fallback project, universal password, service credential, or diagnostic UI
