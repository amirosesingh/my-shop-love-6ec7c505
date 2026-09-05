# Stop repeated admin and supervisor prompts

## Confirmed problem

There are two separate access systems that do not share the successful sign-in:

1. **The app knows who is signed in, but the Windows security layer does not.** After online Admin/Supervisor sign-in, `pos-auth.tsx` loads the account and permissions, but it never establishes the short-lived desktop administration grant in `electron/admin-session.cjs`. The first protected database/settings call is therefore refused by `electron/ipc-privilege.cjs`, and `PrivilegeGate` asks for a username and PIN again. This is why a real Admin can enter Settings but still gets the unlock popup.
2. **Supervisor is currently labelled as Admin in the app.** In `pos-auth.tsx`, the combined “elevated” result is assigned to `isAdmin`, so supervisors/managers can be shown Admin-only controls. The desktop layer then correctly refuses Admin-only operations and asks for stronger credentials. This creates repeated and misleading prompts.

The central sign-in session and the desktop grant are also cleared independently, so they can drift apart during reloads and expiry.

## Changes

1. **Use the signed-in account as the single source of access**
   - After a successful online sign-in, securely prove the current session to the Windows process and establish its in-memory Admin or Supervisor grant automatically.
   - Validate the session and role before granting access; never trust a role claim supplied only by the screen.
   - Keep access tokens in memory only, never log or persist them, and never send a service credential to a terminal.

2. **Correct the role model**
   - `isAdmin` will mean Admin/Owner only.
   - `isSupervisor` will include Supervisor/Manager and Admin.
   - Settings pages and actions will open according to their actual permission: ordinary settings for accounts with the settings permission, supervisor operations for supervisors, and connection/database identity changes for Admin only.

3. **Remove redundant prompts for already-authorised users**
   - An Admin who has signed in normally will not be asked to sign in or enter a supervisor PIN again for Admin settings.
   - A Supervisor will not be prompted for actions already covered by their role and permissions.
   - If a Supervisor selects a genuinely Admin-only operation, show a clear “Admin required” message instead of repeatedly asking for a supervisor PIN that can never authorize it.
   - Preserve manager override prompts only for a cashier or staff member who lacks the required permission.

4. **Keep the two sessions aligned**
   - Clear the desktop grant on logout, lock/switch-user, session rejection, account deactivation, and window reload.
   - Refresh the short-lived grant while the validated signed-in session is active; do not extend it from an unverified screen claim.
   - Preserve offline selling, cashier PIN login, first-run setup, and Emergency Access unchanged.

5. **Regression coverage and release check**
   - Test Admin sign-in → database/settings changes without a second prompt.
   - Test Supervisor sign-in → allowed settings without a prompt, Admin-only changes refused clearly.
   - Test cashier/staff actions still request a supervisor override only when needed.
   - Test logout, expiry, reload, and deactivation remove desktop access.
   - Run the full test suite and type check, then bump the application version using the required version script.

## Technical notes

- Add a dedicated open IPC handshake for adopting a validated signed-in session; the Electron process verifies the session against the configured company backend before calling a new grant method in `electron/admin-session.cjs`.
- Keep `ipc-privilege.cjs` as the final authority for every privileged desktop channel; do not weaken or bypass its channel classifications.
- Update `pos-auth.tsx` to distinguish true Admin from Supervisor/Manager and synchronize grant lifecycle with login/logout.
- Update `PrivilegeGate` wording/behavior so a role mismatch is final and does not loop through an impossible PIN retry.
