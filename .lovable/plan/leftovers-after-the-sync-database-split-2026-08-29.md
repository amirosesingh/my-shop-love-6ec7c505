# Leftovers after the sync/database split

Everything you asked for in the last round is in place: sync and database pages are separate, one shared sync state with one panel and one "Sync now" trigger, versioned per-environment schema files with tracking, and the wider layouts. Editable sync interval/batch/retry is also already live in the sync settings panel, so nothing is outstanding there.

Three small loose ends remain. All are optional polish, not bugs users will hit.

## 1. Database page still starts a sync

Switching the database mode on the database connection page kicks off a push and a pull directly. That is a second sync trigger outside the sync panel, which is exactly what we set out to remove.

Change: after a mode switch, just ask the engine to re-check connectivity and let the normal cycle (or the sync panel button) do the transfer. No sync work started from the database page.

## 2. The SQL badge still polls on its own

The small database badge in the header runs its own 10-second timer against the local database instead of reading the shared status. It can therefore briefly disagree with the cloud/sync indicator next to it.

Change: read the local database part of the unified status instead of polling, so both indicators always tell the same story.

## 3. Sync/database entries in the settings tab groups

The new database page is in the settings catalog, navigation and visibility rules, but not in the grouped tab metadata used by the system hub. Adding it keeps the grouped view consistent with the sidebar.

## Technical notes

- `DatabaseConnectionSettings.tsx`: drop the `drainOutbox`/`pullDelta` call on mode change, call `heartbeat()` instead.
- `SqlAdminBadge.tsx`: consume `useSystemStatus().local` and delete the local `setInterval`.
- `settings-groups.ts`: add the `/settings/database` entry alongside the reframed sync entry.
- Verification: typecheck, full vitest run, and load `/settings/database` plus `/settings/sync`.
