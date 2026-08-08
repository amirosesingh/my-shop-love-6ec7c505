# Repair terminal activation and Android upgrades

## Confirmed issues

- The activation client calls `terminal_token_status` and then `terminal_token_claim` before the device has a user session. The current database grants allow visitor access to status and heartbeat, but `terminal_token_claim` is granted only to signed-in users and the service role. This exactly accounts for the reported permission error.
- The `terminal_token_status` alert is produced by the nightly checker even though this narrowly scoped, token-ID lookup is intentionally part of pre-login activation. The checker already treats heartbeat as an intentional public routine but does not apply the same explicit treatment to status/claim.
- `app_users` currently has row protection enabled, no direct visitor/signed-in table read grant, and no policies. That is intentional because the table contains PIN hashes and staff data; the displayed alert is stale or came from a different database state. It must be rechecked, not “fixed” with a broad read policy.
- Android CI runs Capacitor sync but never runs `scripts/android-permissions.cjs`, so the generated app may omit the camera permission.
- Android CI produces a debug APK signed by a temporary runner key. A later APK has a different signature, so Android requires uninstalling the old app. Uninstalling deletes Capacitor Preferences and therefore the encrypted activation identity.

## Implementation

1. **Repair activation permissions safely**
   - Add an idempotent database repair that recreates the three narrow terminal routines with locked lookup paths.
   - Revoke default/public execution first, then grant only `terminal_token_status`, `terminal_token_claim`, and `terminal_token_heartbeat` to the pre-login visitor role, signed-in users, and the service role.
   - Keep the `terminal_tokens` table itself inaccessible to visitors; activation remains an atomic one-time claim by unguessable token ID.
   - Update the canonical split schema and standalone repair script so fresh and existing POS databases receive identical grants.

2. **Correct the nightly security findings**
   - Treat the deliberately narrow terminal activation routines as reviewed public entry points in `security_selfcheck`, while continuing to flag any other unexpected public privileged routine.
   - Preserve `app_users` as RPC-only with no direct client table reads; do not expose `pin_hash` through a new policy.
   - Re-run the self-check after the migration so stale `app_users` and terminal status findings resolve when the live state is safe.

3. **Make Android camera permission deterministic**
   - Run the Android permission patch after every `cap sync`, both in the package script and GitHub workflow.
   - Keep runtime `checkPermissions()` / `requestPermissions()` before ML Kit scanning, and add a focused test/verification that the generated manifest contains `android.permission.CAMERA`.
   - Verify first scan prompts for camera access and both QR activation and product barcode scanning open without deregistering the terminal.

4. **Enable signed install-over Android updates**
   - Change the workflow from ephemeral debug APKs to release APKs signed with the permanent GitHub Actions secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`.
   - Apply a monotonically increasing Android `versionCode` and the package `versionName` during CI, while keeping the existing app ID unchanged.
   - Fail the release clearly if signing secrets are absent rather than publishing an incompatible APK.
   - Continue publishing versioned and latest R2 objects, now using the signed release APK.

5. **Preserve activation across upgrades**
   - Keep terminal config, its AES key, and machine credentials in the existing Capacitor Preferences allow-list.
   - Harden startup restoration so a normal signed APK update rehydrates the encrypted terminal identity before activation/revocation checks run.
   - Only clear activation after a positive server revocation; camera cancellation, permission denial, network failure, and app process recreation must not clear it.

## Verification

- Anonymous pre-login probes: status works for one token ID, a fresh token claims exactly once, a second claim is rejected, heartbeat works, and direct visitor reads of `terminal_tokens` remain denied.
- Signed-in staff can still issue/manage tokens; an arbitrary caller cannot choose or alter another owner/account.
- Security self-check no longer reports the two supplied findings, while an unexpected public privileged routine would still be detected.
- Build the signed APK twice with increasing version codes, install the second over the first without uninstalling, and confirm the terminal remains activated.
- On a clean Android install, confirm the first scanner launch requests camera permission and successful scanning leaves the terminal registered.

## Required GitHub secrets

The workflow will consume the permanent Android signing values from GitHub Actions secrets, as selected. The keystore itself and its passwords will never be committed or printed.