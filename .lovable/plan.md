# Phase 2 — Offline decoupling of the app screens

Goal: on a till (desktop shell), no screen should hit the cloud directly. Every read and write goes through the router, which serves the terminal copy when the line is down. The web admin portal keeps working online exactly as today.

## What changes

### 1. Screens that still call the cloud directly
- **Staff management** — the staff list and permission saves call cloud procedures directly, so the screen is blank offline. Route the list read through the router (local mirror of staff accounts when offline) and keep permission writes online-only with a clear "needs connection" message instead of a silent failure.
- **Notifications & alerts, Encrypted credentials, Connection check** — these only pull the signed-in admin's session token to authorise a server call. That stays, but each gets one shared helper so the "sign in as admin" path is identical, and each shows an offline notice rather than an error toast when there is no line.
- **Sessions and Receipt history** — already read through the router; only their leftover cloud imports get removed.

### 2. Core data layer (`pos-db.ts`)
Seventeen places still talk to the cloud directly. Each is reclassified:
- **Reads** (products, members, promotions, settings, stores, sales history, product lookups, membership tiers) → go through the router, which already falls back to the terminal copy and reports where the rows came from.
- **Writes** (settings save, audit log, seed inserts) → go through the router's write path so they queue on the till and sync later instead of failing.
- **Shift procedures** (open shift, active shift for branch) → stay online-first but fall back to the local shift mirror when offline, so a cashier can still open and continue a shift with no line.

### 3. Guard against regressions
Add a lint rule that flags direct cloud imports in screens and in the data layer, with an allow-list for the few files that legitimately need the session token (auth, credentials, connection check). This is what stops phase 2 from silently undoing itself.

## Technical notes
- Router entry points: `dbRouter.query/queryWithSource` for reads, `dbRouter.insert/upsert/update/write` for writes.
- Offline detection uses the existing `effectiveDatabaseMode()` and `lastHealth()` — no new probes.
- Shift RPCs have no local equivalent; the fallback reads the mirrored `shifts`/`shift_sessions` rows and queues the open/close as an outbox op.
- ESLint `no-restricted-imports` on `@/integrations/supabase/external-client` with per-file overrides.
- No schema changes; phase 1 already landed those.

## Out of scope
Conflict resolution and queue unification (phase 3), two-way pull engine (phase 4).
