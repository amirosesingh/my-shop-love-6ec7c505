# Emergency access: type the device's own date and time

Replace the 6-digit secret-derived recovery code with the plain current local date and time of the device itself. Nothing is stored, nothing is derived from a secret, and the code changes as the minute changes.

## The code

Format: `YYYYMMDDHHMM` — 12 digits, taken from the device's own clock in its own local timezone.

Example: 3 September 2026, 15:04 local becomes `202609031504`.

- Android reads the phone/tablet clock, Electron reads the PC clock, web reads the browser clock. Same single function on all three.
- Accepted window: the current minute plus one minute either side, so a code typed a few seconds late still works. Anything older or newer is rejected.
- Nothing is written to storage, sent to the backend, or logged.

## What changes on screen

- The gate asks for the 12-digit date-and-time code and shows the expected format (`YYYYMMDDHHMM`), not a 6-dot PIN row.
- The keypad grows to accept 12 digits and submits on the twelfth.
- The "Terminal <fingerprint>" line is dropped — there is no per-device secret any more.
- Failed-attempt lockout stays exactly as it is today (recovery-scoped counter, temporary lock after repeated wrong entries).

## What is removed

- The per-device random secret and its HMAC code derivation (`src/lib/emergency-pin.ts`, `src/lib/emergency-fallback-pin.ts`, the Electron main-process verifier in `electron/emergency-pin.cjs` and its bridge calls).
- Secret escrow to the backend and the admin "emergency codes" screen that displayed a live per-terminal code — with a clock-only code there is nothing to escrow or look up. The settings entry is removed.
- Android Keystore storage of the emergency secret.

## Unchanged

Normal cashier login, terminal registration, permissions, sync and all other security stay exactly as they are. Only the emergency recovery path changes.

## Technical notes

- New single source: `emergencyCodeAt(date)` returning `YYYYMMDDHHMM`, and `verifyEmergencyPin(code)` comparing against slots at -1, 0, +1 minutes with a constant-time compare. Both live in `src/lib/emergency-pin.ts`; `emergency-fallback-pin.ts` is deleted along with its test.
- `EmergencyPinGate.tsx`: length constant 6 → 12, dots replaced by a digit readout, fingerprint line removed.
- Electron: `verifyEmergencyPin` / `emergencyFingerprint` / `emergencyEscrowSecret` IPC handlers and preload exposures removed; `scripts/emergency-pin.cjs` (code generator) removed.
- Escrow removal touches `src/lib/emergency-escrow.ts`, `emergency-escrow.server.ts`, `src/routes/api/public/emergency-escrow.ts`, `src/routes/settings.emergency-codes.tsx`, `src/lib/emergency-codes.functions.ts` and the settings catalog entry.
- Tests: `emergency-pin.test.ts` rewritten for the clock code (accepts current/±1 minute, rejects 2 minutes off, rejects wrong length/non-digits); `emergency-fallback-pin.test.ts` and `emergency-escrow.test.ts` removed. Version bumped via `scripts/bump-version.cjs`.

## Security note

Anyone who can see the terminal's clock can compute this code — it is a convenience recovery gate, not a secret. Say the word if you would prefer a short fixed prefix or suffix known only to you added to the date-time, which keeps the "changes every minute" behaviour but is not guessable from the clock alone.
