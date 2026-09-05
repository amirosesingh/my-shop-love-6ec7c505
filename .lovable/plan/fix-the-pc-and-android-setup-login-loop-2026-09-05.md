# Fix the PC and Android setup/login loop

## Confirmed cause

The intended order exists inside `AppShell`, but an earlier layer can bypass it:

1. `AuthProvider` starts the external authentication client while the application is mounting.
2. On a fresh device with no saved connection, that client throws `SupabaseConfigError`.
3. The root error handler catches it and currently renders `TerminalActivation` when no activation
   record exists (`src/routes/__root.tsx:68-72`). This is the wrong fallback: it skips the API
   configuration screen entirely.
4. Activation then cannot work because it needs the database connection that was skipped. The user
   is left on the generic “Try again / Emergency access” path or an activation control that cannot
   complete.

This accounts for the reported behaviour on both desktop and Android. The recent startup probe fix
cannot correct it because this exception happens outside/before the `AppShell` decision tree.

## What will change

1. **Stop authentication from starting before device configuration is ready.** On Windows and
   Android, authentication/session restoration will wait for the existing secure connection-profile
   hydration and local readiness result. Missing configuration is treated as the normal fresh-install
   state, not as a page crash. The web path stays unchanged.

2. **Correct the root fallback.** A terminal-side `SupabaseConfigError` will never render terminal
   activation. It will render the existing database/API configuration screen first. The Cloudflare
   instructions remain only for the web version.

3. **Enforce one startup decision path after save/retry.** “Test and continue” will re-run readiness
   and the connection probe, then return to the shared startup decision:
   - no configuration → API configuration;
   - valid configuration + no/invalid registration → terminal activation;
   - valid configuration + valid registration → normal staff sign-in.

4. **Prevent the stale error screen from trapping the user.** After a successful configuration save
   or connection retry, reset/invalidate the error state and refresh the startup gate so the next
   screen appears without restarting the app.

5. **Fresh-install Emergency Access visibility only.** Hide its button only when absolutely no local
   API/database configuration has ever been saved. Once details exist—even if currently unreachable—
   Emergency Access remains available and behaves exactly as it does now. Its code, Recovery Hub,
   permissions and repair tools are not redesigned or bypassed.

## Verification

Cover and run these flows on the shared decision logic and mounted application shell:

- fresh install: configuration screen first, no Emergency Access button, no auth request;
- save + successful test: activation screen next;
- configured but unregistered: activation, never login;
- configured and registered: normal login;
- missing configuration with stale activation data: configuration first;
- invalid/revoked registration: re-activation;
- failed login: meaningful login error without falling into the root crash screen;
- existing configuration failure: Emergency Access still opens normally;
- successful repair/retry exits the error state and resumes the correct step.

Run the targeted tests and full test suite, then bump the application version.

## Deliberately unchanged

- Emergency Access implementation and security.
- Backend/database architecture and terminal activation rules.
- Secure Windows/Android storage and the no-web-fallback rule.
- Cashier keypad, local staff authentication, POS screens, roles and navigation.
- Web configuration and working web login.
