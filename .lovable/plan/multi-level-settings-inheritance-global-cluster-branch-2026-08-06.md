# Multi-level Settings Inheritance (Global → Cluster → Branch)

Today every setting is either one shared row (`pos_settings`, global) or a per-store row
(`pos_store_settings`, keyed by `store_id`), and clusters exist only as a loose `group_id`
text field on each store. There is no way to say "this branch follows its cluster" or to
push a cluster's setup to its branches. This adds a real three-tier settings layer.

## What you get

- A **Settings Inheritance** page with a scope picker at the top: Global, a cluster, or a branch.
- Every setting row shows a **Sync with parent / Override** switch:
  - Sync mode: field is read-only and shows the value it inherits.
  - Override mode: field unlocks and saves a value just for that scope.
- A badge on each row: `Inherited from Global`, `Inherited from Cluster`, or `Branch override`.
- Sensible defaults per category:
  - **Device & hardware** (printer, drawer, terminal id) — branch-specific by default.
  - **Inventory & operations** (stock sync, low-stock threshold, transfer approval) — cluster by default.
  - **System & integration** (currency, tax, base permissions, API keys) — global by default.
- **Push settings to child branches** button with a confirmation modal listing, per branch,
  what will be overwritten vs. what already matches, before anything is written.
- Cluster management on the Locations page: create/rename clusters and assign each branch to one.

## Technical design

### Database (new `supabase/sql/14_settings_scopes.sql`, run against the POS backend)

- `store_groups(id text pk, name text, created_at, updated_at)` — the cluster registry;
  `stores.group_id` becomes the reference.
- `settings_scoped(scope text check in ('GLOBAL','CLUSTER','BRANCH'), scope_id text default '',
  key text, value jsonb, is_overridden boolean default true, updated_by text, timestamps,
  primary key (scope, scope_id, key))`. Only rows with `is_overridden = true` carry a value;
  clearing an override removes the row so the parent value applies again.
- Security-definer RPCs (staff read, supervisor write), matching the endpoint contract:
  - `settings_effective(_scope, _scope_id)` → per key: `value`, `source` (GLOBAL/CLUSTER/BRANCH),
    `is_overridden`, `parent_inherited_value`.
  - `settings_upsert(_scope, _scope_id, _patch jsonb)` — patch entries are
    `{ key: { value, is_overridden } }`; turning off an override removes the local row and the
    response returns the recalculated inherited value.
  - `settings_sync_batch(_scope, _scope_id, _keys text[], _mode)` — push a cluster's values to all
    its branches, or a global set to all clusters/branches; returns a per-target write summary.
- Grants + RLS in the same file, following the existing `13_pos_rules.sql` pattern.

### Server API (TanStack server functions + HTTP routes)

- `src/lib/settings-scope.server.ts` — RPC wrappers, caller verification reusing
  `verifyPosStaff` from `secure-settings.server.ts`, and the resolution/merge helpers.
- `src/lib/settings-scope.functions.ts` — `getScopedSettings`, `upsertScopedSettings`,
  `syncSettingsBatch` server functions for the UI.
- Thin HTTP routes for external callers mirroring the requested contract:
  `src/routes/api/settings.ts` (GET `?scope=&scopeId=`), `src/routes/api/settings.upsert.ts` (PUT/POST),
  `src/routes/api/settings.sync-batch.ts` (POST). All Zod-validated and staff-authenticated.

### Shared model

- `src/lib/settings-scope.ts` — the setting registry: key, label, type (boolean/number/text/select),
  category (`device` / `inventory` / `system`), default tier, and shipped default value. The UI and
  the resolver both read this one list, so adding a setting is a one-line change.

### Frontend

- `src/routes/settings.inheritance.tsx` — new page, added to the settings hub nav.
- `src/components/pos/settings/ScopeSelector.tsx` — Global / Cluster / Branch picker.
- `src/components/pos/settings/InheritedField.tsx` — one row: label, sync switch, input, source badge.
- `src/components/pos/settings/PushToChildrenDialog.tsx` — batch confirmation modal with the
  overridden-vs-inherited summary before calling the sync-batch endpoint.
- Locations page (`src/routes/stores.tsx`) gains cluster create/assign controls.

### Notes

- Existing `pos_settings` and `pos_store_settings` keep working; the resolver reads them as the
  seed values for the matching keys so nothing regresses on day one.
- Writes stay server-side and supervisor-gated; the till never writes settings directly.
- Because this backend is the self-hosted POS database, the new SQL file must be run there
  (and is added to `99_run_all.sql`).