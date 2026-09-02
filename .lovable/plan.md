# Final polish after the connectivity + Emergency Access update

The connectivity and Emergency Access work is complete and verified at v1.3.91. What remains is small, low-risk polish across the three platforms. No database migrations, no trading/checkout changes.

## 1. Android customer display entry
Customer Display exists as a route but has no reachable entry on Android. Add a clearly labelled launcher in the mobile shell that opens the display view on the device. It stays display-only: no pairing, no second-screen assumptions, and it is hidden when the feature is switched off in Branding settings.

## 2. Windows offline clarity
On the desktop till, make the offline situation unmistakable:
- Persistent "Offline mode" label in the status cluster when the cloud probe is unreachable but the terminal is inside its grace window.
- Show the count of items waiting to sync next to that label, using the existing sync-progress state (no new counters).
- Show the grace expiry date in the same tooltip so staff know how long they can keep trading.

## 3. Consistency sweep
- Confirm every startup and Emergency Access branch shows one message style (quiet "waiting for a connection" offline, real errors only when the server actually rejects credentials).
- Re-run the full test suite and typecheck, and load `/`, `/recovery`, and `/display` in preview.

## Technical notes
- Files touched: mobile shell navigation, `StatusCluster`, `AppShell` offline banner, and the shared sync-progress reader. No changes to `supabase/`, checkout, printing, or sign-in logic.
- Reuse `startupDecision`, `graceDays()`, and existing capability flags in `platform-config/features.ts`; no new platform branches.
- Version bump at the end, as usual.
