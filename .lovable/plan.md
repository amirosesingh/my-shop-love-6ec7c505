# Emergency Access PIN Gate (Android + Electron)

## Findings — current vs required

### Emergency Access PIN Gate
Current: Missing. Both entry points — the Android offline gate (`OfflineGate.tsx`) and the Electron cloud-setup gate (`CloudSetupGate.tsx`) — link straight to `/recovery`, which renders the backend address and cloud connection panels immediately. `/recovery` is also an explicitly public, unguarded route.
Required: Insert a PIN gate in front of the recovery panels so the flow is Emergency Access → PIN Gate → Recovery Settings, on both platforms, including direct navigation to `/recovery`.

### PIN Generation
Current: Missing. There is no emergency PIN of any kind. The only PIN logic in the app is the cashier/manager PIN, which is verified against the database or the till's local PBKDF2 verifier — both unusable for recovery.
Required: Add a time-based PIN derived locally from the device clock (year, month, day, hour, minute) via HMAC over a time slot, not from the raw date string, with a tolerance window for small clock drift.

### PIN Security
Current: Not applicable — nothing stored. Secure storage primitives already exist and are correct to reuse: Electron `safeStorage` (`electron/cloud-credentials.cjs`, `server-keys.cjs`) and Android Keystore via `capacitor-secure-storage-plugin` (`secure-cloud-config.ts`). `pin-lockout.ts` already provides local brute-force throttling.
Required: Never store the PIN. Keep only the recovery secret, sealed in `safeStorage` (Electron) / Keystore (Android), never in localStorage or Capacitor Preferences. Compare in constant time and throttle failed attempts.

### Recovery Settings After PIN
Current: Already correct in substance — `/recovery` renders only `BackendAddressPanel` and `CloudConnectionPanel`, needs no live backend, and is exempt from route guards.
Required: No change to the panels. Only gate them behind the PIN, and keep the unlock scoped to the current session (memory only, cleared on reload/close).

## What will be built

1. `src/lib/emergency-pin.ts`
   - Time slot = `floor(deviceEpochMs / 60000)` rendered as `YYYYMMDDHHmm` in device local time.
   - `pin = first 6 digits of HMAC-SHA256(recoverySecret, slot)` via WebCrypto.
   - Verification accepts the current slot ±N slots (default ±3 minutes) to absorb clock drift; constant-time compare.
   - The PIN is never persisted or logged.

2. Recovery secret handling
   - Electron: generated once on first run, sealed with `safeStorage` alongside the existing cloud credentials store, exposed to the renderer only through a `verifyEmergencyPin(pin)` IPC call — the secret itself never crosses into the renderer.
   - Android: generated once, stored in Keystore-backed secure storage through the same plugin already used for cloud keys; verification runs in the renderer using the value read from Keystore.
   - Both derive the same PIN for a given minute, so a paired support/admin tool can compute it.

3. `src/components/pos/EmergencyPinGate.tsx`
   - Numeric keypad dialog shown by `/recovery` before the panels render.
   - Uses the existing `pin-lockout.ts` throttling (separate storage key) — 5 wrong attempts locks entry for 5 minutes.
   - On success sets an in-memory unlock flag for the session only.

4. `src/routes/recovery.tsx`
   - Renders the gate until unlocked, then the existing `BackendAddressPanel` + `CloudConnectionPanel` unchanged.
   - Web build is unaffected: the gate only applies on terminal apps (`isTerminalApp()`), matching the existing Emergency Access entry points.

5. Support-side PIN generator
   - `scripts/emergency-pin.cjs` — prints the valid PIN for a given secret and minute, so an operator can read the code to the cashier over the phone.

6. Tests
   - Unit tests for slot derivation, drift tolerance, and rejection outside the window.

## Notes
- No changes to Web behaviour, terminal/branch configuration, sync, or any POS feature.
- Neither app becomes offline-capable; this only gates the existing recovery configuration screen.

## Open point
The recovery secret is generated per device, so each till has a different PIN. If you'd prefer one shared secret across the fleet (so support can compute a PIN without knowing the device), say so and I'll source it from a build-time value sealed into the same secure store instead.
