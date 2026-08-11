# Permission centralisation, two-way auto-sync, and checkout failure handling

## Current state (verified)

- `src/lib/permissions.ts` already holds the whole permission vocabulary (48 keys, labels, role presets, legacy aliases, `normalizePermissions`). What it lacks are the three helper functions asked for and a single role-to-permissions resolver that consults custom roles.
- Permission evaluation is spread across `pos-auth.tsx` (`can`), `pos-permissions.tsx` (`hasPermission` / `requirePermission`), `PermissionGate.tsx`, plus inline permission reads in routes.
- Roles already come from `staff_roles` via `src/lib/staff-roles.ts`; `app_users.role_slug` is the link (there is no `role_id` column).
- `sync-engine.ts` pushes the outbox oldest-first with an `online` listener and a 15s tick; there is **no downward delta pull** in the web/Electron renderer. The Electron worker (`electron/sync/worker.cjs`) does pull, but only catalogue tables and only on `created_at`, and the renderer never sees it.
- Local SQL rows already carry `is_synced` / `sync_status`; the outbox already de-duplicates by row `id` (upsert on conflict), so replay is idempotent.
- The header pill `SyncStatus.tsx` shows Offline / pending / Synced, but has no "syncing now" state.
- Checkout (`completeSale`, `src/routes/index.tsx`) already awaits the save and keeps the cart on failure, showing a toast only.

## Step 1 — One place for permissions

Add to `src/lib/permissions.ts`:

- `hasPermission(user, key)`, `hasAnyPermission(user, keys[])`, `hasAllPermissions(user, keys[])` — accepting either a signed-in user object or a permission matrix, tolerant of legacy flag names.
- `getEffectivePermissions(roleSlug)` — resolves a role (built-in or custom, from the cached `staff_roles` list) to a full matrix, with per-person overrides layered on top by `normalizePermissions`.
- A small in-memory role cache filled when roles are loaded, so the resolver works offline.

Then refactor consumers to use these helpers: `pos-auth.tsx#can`, `pos-permissions.tsx`, `PermissionGate.tsx`, `nav-config`, and the inline checks in settings, inventory, reports, staff and register code. The session context keeps holding the resolved matrix, now produced by `getEffectivePermissions(role_slug)` plus stored overrides. No permission behaviour changes — same keys, same defaults.

## Step 2 — Reconnection detector

In `src/lib/sync-engine.ts`:

- Keep the `online` listener, add a lightweight periodic health ping to the central database (short timeout, backing off while offline) so a dead link that never fires `offline` is still detected.
- On an offline-to-online transition, kick a full cycle (push then pull) in the background; the till stays usable throughout.
- Publish engine state (`idle | syncing | offline`, pending count, last sync time) through a small subscribable store the header reads.

## Step 3 — Upward sync (this terminal to cloud)

- Drain stays oldest-first by creation time per terminal (already implemented); pending rows are read from the outbox and, on Windows, from local SQL rows flagged `is_synced = 0`.
- Sales, shifts and other keyed rows keep replaying as upsert on the row id, which is the idempotency key — a retry after a half-finished push updates the same row instead of creating a second sale.
- On success the local row is flagged synced with a `synced_at` stamp (new column on the local SQL side, `syncedAt` on outbox entries).

## Step 4 — Downward delta sync (cloud to this terminal)

- Store `last_successful_sync` in local settings.
- After each successful push, pull rows changed since that stamp from `app_users` (offline credentials, PIN hashes, role slug, permissions), `staff_roles`, `products`, `stores` and `pos_settings`, using `updated_at >`.
- Upsert them into the local snapshot and, on Windows, the local SQL database. Rows still pending upload are never overwritten by a pull.
- Advance `last_successful_sync` only when the whole pull succeeded; the Electron worker's pull switches to the same `updated_at` watermark so both paths agree.

## Step 5 — Header status and checkout failure

- `SyncStatus.tsx` gains three clear states: green "Online (in sync)", amber "Offline (local mode)", blue spinner "Syncing N items…", keeping the manual push on click and the existing database-mode chip.
- Checkout: when the save fails on every target, replace the plain toast with a blocking "Payment not saved" dialog — it states where it failed, keeps the cart and tenders exactly as they were, and offers Retry / Cancel. Nothing prints, no drawer kick, and no receipt number is consumed until the sale is genuinely stored. The same dialog is reused by other write-critical actions already reporting an all-targets failure.

## Verification

- Unit tests: permission helpers (role preset plus override layering, legacy aliases), replay idempotency (same sale pushed twice yields one row), pull watermark not clobbering pending rows.
- Manual: three sales offline then reconnect (expect three rows, no duplicates); change a PIN in the cloud while the till is offline, reconnect, confirm the new PIN works locally.

## Technical notes

- Role link is `app_users.role_slug` to `staff_roles.slug`; no schema change needed for Step 1.
- Local SQL gains `synced_at` on synced tables and a `sync_state` key for `last_successful_sync` (script added under `supabase/sql/` and `db/offline/`).
- New `src/lib/sync-status.ts` (subscribable engine state) consumed by `SyncStatus.tsx`.
- Version bump.