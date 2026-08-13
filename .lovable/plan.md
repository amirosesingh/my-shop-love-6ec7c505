# Global vs. Store-Wise Settings Matrix

## What the audit found

- All app configuration lives in one global row: `pos_settings` (tax, receipt, payment, whatsapp, review, hours, integrations, visibility, booking slip, notifications). `usePos().state.settings` loads it and `updateSettings()` writes it — every branch shares one copy today.
- Branch identity is already solid: `src/lib/active-branch.ts` resolves the terminal-bound branch, and `usePos()` exposes `currentStore` / `stores` with `groupId` clusters.
- A three-tier engine already exists but only for a small hand-written key list (`src/lib/settings-scope.ts`, `settings-scope.server.ts`, `settings_scoped` table, `settings.inheritance` page). Nothing in the real settings pages uses it.
- Booking / racket intake settings (service types, fees, booking slip) are plain fields inside the global integrations blob — the most obvious candidates for per-branch values.

So the work is to connect the real settings to the existing scope engine, add lock control, and add a resolver everything reads through.

## What you get

- **Every settings card gets a scope badge**: `Global default` or `Store override`, with a toggle to switch that block to a store-specific value for the branch you are working in.
- **Super-admin lock control**: each settings block can be marked `Locked globally` (branch managers see it read-only, with a lock note) or `Configurable per store`. Tax policy, audit/review rules and numbering default to locked; service fees, printer/hardware, catalog mappings and custom buttons default to per-store.
- **Predictable fallback everywhere**: store override → global value → shipped application default. The resolved value is what the till, receipts, bookings and reports use, so a branch's local restringing fee or paper size takes effect without touching other branches.
- **Store scope follows the terminal**: the active branch is the one this terminal is bound to; head-office users can switch branch from the scope picker on the settings hub.
- **Version bump** at the end of the change.

## Technical design

### Data
New migration file `supabase/sql/40_settings_scope_matrix.sql`:
- Extend `settings_scoped` usage to section-level keys (`tax`, `receipt`, `payment`, `hours`, `review`, `integrations`, `visibility`, `bookingSlip`, `notifications`), storing a JSON patch per scope rather than only scalars.
- New `settings_locks(section text primary key, locked boolean, updated_by text, timestamps)` with grants + RLS: staff read, supervisors write.
- RPCs `settings_locks_read()` and `settings_locks_set(_section, _locked, _by)`, security definer, mirroring the existing `settings_upsert` pattern; grants in the same file.

### Resolution engine
- `src/lib/settings-resolve.ts` — pure merge: `applyPatch(defaults, globalRow, storeOverride)` per section, plus `isLocked(section)`. Deep-merges section objects so a branch can override one field without copying the block.
- `src/lib/settings-scope.server.ts` gains section-patch read/write helpers reusing the existing service-role fallback path.
- `src/lib/settings-scope.functions.ts` gains `getSectionScope`, `setSectionOverride`, `clearSectionOverride`, `setSectionLock`.

### Store wiring
- `src/lib/pos-store.tsx` loads the global settings row as today, then applies the active branch's override patch before publishing `state.settings`, so all existing consumers get resolved values with no call-site changes.
- `updateSettings()` becomes scope-aware: when the current section is in store-override mode it writes the branch patch; otherwise it writes the global row as now. Writes are blocked client- and server-side when the section is locked and the caller is not a super admin.

### UI
- `src/components/pos/settings/ScopeBadge.tsx` — badge + override switch + lock control, rendered by `SettingsFrame` so every settings page picks it up from one change.
- `src/components/pos/settings/SettingsFrame.tsx` gains `section` and `scopeControls` props.
- `src/routes/settings.index.tsx` gets a branch scope picker showing which store you are editing.
- Existing `settings.inheritance` page stays and reuses the same lock state, so the cluster tier keeps working.

### Notes
- The existing global `pos_settings` row remains the source of the global tier — no data migration, nothing regresses on day one.
- Version bumped via `scripts/bump-version.cjs` as the final step.
