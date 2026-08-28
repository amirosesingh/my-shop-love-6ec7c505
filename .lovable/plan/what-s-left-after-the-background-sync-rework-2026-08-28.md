# What's left after the background-sync rework

Stages 1–5 of the sync plan are done and verified (typecheck clean, 269 tests passing). Three things remain.

## 1. Stage 6 — editable sync settings

Add a "Sync behaviour" card to the existing Sync settings screen so a manager can tune the worker without a rebuild:

- How often the app checks for changes (5s–5min, default 20s)
- How many changes are sent per pass (1–500, default 25)
- Connection check frequency (5s–5min, default 20s)
- How many times a failed change is retried before it is parked (1–50, default 10)
- Longest wait between retries (30s–30min, default 5min)
- "Reset to recommended" button

Every value is already clamped in the config module, so a bad entry can never break the worker. Changes take effect immediately.

## 2. Make the worker react to a settings change live

Right now the background timer and the connection-check interval read their settings once, when the app starts. After the settings card exists, a change would only apply on the next restart. Fix: the worker subscribes to the settings and rebuilds its timers when they change.

## 3. Show the new failure reason in the Sync hub

Failures are now tagged as network / sign-in / conflict / data problem, but the Sync hub still shows the raw message only. Add a small coloured tag per log line and a count per reason at the top, so "it isn't syncing" becomes an answerable question at a glance.

## Not included

- No database or schema changes.
- Web and Android stay online-only; the Windows till keeps working offline.
- No change to conflict resolution, parked-row handling or credential parking.

## Technical notes

- `src/components/pos/SyncSettings.tsx` gains the card, backed by `setSyncConfig` / `resetSyncConfig` from `src/lib/sync-config.ts`.
- `startSyncEngine()` in `src/lib/sync-engine.ts` subscribes to `subscribeSyncConfig` and recreates its interval and the connectivity monitor on change; the monitor restart must stay idempotent.
- `src/components/pos/sync/SyncHub.tsx` renders `SyncLogEntry.kind` from `src/lib/sync-log.ts`.
- Tests: config persistence and clamping already covered; add one for timer rebuild on config change.
- Verify with typecheck plus the full Vitest run, then bump the version.
