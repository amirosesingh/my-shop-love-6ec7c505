# Offline-first settings, approvals and terminal recovery

Extends what is already here. No rebuild, no second sync engine, no second database.

## What the audit found (verified in the code, not the docs)

Already working and kept as-is:

- The till's own SQL Server / SQLite database is the operational store, written through one gateway (`dbRouter` → `commitOps`), with a durable queue and retry, a 30-second background worker, dependency-ordered upload, per-row attempt counts, id-keyed upserts (so a repeat never duplicates), and a column-drift guard.
- 40 tables upload, 8 catalogue tables plus members, transfers and bookings come back down, and 24 tables can be pulled back after a wipe by the existing restore routine.
- Trading records, cash counts, drawer events, stock movements and the governance trail (approvals, record edits, member verifications, status history) are already written to the till first and pushed afterwards.
- Terminal identity, branch ownership, activation tokens, secure credential storage, the emergency access code and the environment separation between website / Android / Windows builds.

Confirmed gaps, each one a real code path:

1. **Settings are online-only.** Register rules save through a central routine (`pos_rules_save`), and branch/cluster settings through another (`settings_upsert` / `settings_scoped`), both reached over the network from server code. With the line down the save simply fails; nothing is stored on the till and nothing is queued. The coverage file even records this as deliberate ("resolved online").
2. **Settings do not come back after a rebuild.** Restore brings back the single terminal settings row, but not the branch/cluster settings and not the register rules, so a reinstalled till returns with built-in defaults for those.
3. **Approvals have no offline policy.** Approval rules live centrally and every approval check calls the central database; there is no per-action choice of "no approval / manager PIN / cached authorisation / online only". Offline, approvals just fail.
4. **Recovery is a manual button.** A fresh install does not automatically fetch its branch's data; someone has to open Sync and press restore.
5. **No parity report.** Coverage is derived per table, but there is no single audit that states, for every operational table, whether it uploads, comes back, and can be recovered.

## The work

### Phase 1 — Settings become local-first

- Mirror the settings tables into the till's database (register rules, branch/cluster settings and their overrides/locks) using the existing table lists and column contract.
- Saving a setting writes to the till first, through the same gateway everything else uses, marked as owed to the cloud; the till applies it immediately.
- The background worker uploads it on the next pass, retries on its own, and only marks it done when the cloud confirms.
- The reader prefers the till's copy, so a restart while offline keeps the change.
- Version-and-timestamp conflict handling: a newer central change wins, a local change still waiting to go up is never overwritten (same rule the restore already uses).

### Phase 2 — Other terminals get the change

- The routine download gains the settings tables, scoped to the terminal's own branch and its cluster, so a change made on till 1 lands on tills 2-4 within a sync cycle.
- The branch is taken from the terminal's proven identity on the server, never from a branch id the device asks for.

### Phase 3 — Approvals that work offline, by policy

- Extend the existing approval rules with, per action: approval required yes/no, method (manager PIN, cached authorisation, online verification), and whether offline is allowed.
- The approval check reads that policy from the local settings copy, so it works with the line down.
- Manager PIN is verified against the existing secure local staff credentials — no new PIN system, no plaintext, no weakening.
- "Online verification required" keeps refusing when offline; that is the point of it.
- Every offline approval is recorded on the till (who, terminal, branch, operation, time, method, and that it happened offline) through the governance trail that already uploads.
- Emergency access is untouched.

### Phase 4 — Automatic recovery on a fresh terminal

- After activation, a rebuilt terminal runs the existing restore itself, once, unattended: branch configuration and settings first, then the branch's history, then an integrity check, then the till opens for trade.
- Settings tables are added to the restore list so branding and trading rules come back too.
- The server answers with the branch its token proves; a device asking for another branch is refused.

### Phase 5 — The parity audit

- One generated report per operational table: uploads, comes back down, recoverable, conflict rule, branch/terminal scope, and for anything excluded a written reason. Produced from the existing registry so it cannot drift, and shown on the existing sync/health screen. No silent omissions.

### Phase 6 — Tests and builds

New tests over the existing suite: setting changed offline survives a restart and reaches the cloud on reconnect; a second terminal receives it; no duplicate on retry; offline manager-PIN approval recorded and later uploaded; online-only approval refused offline; fresh terminal recovers its branch and is refused another branch's data; connection lost mid-sync and restored. Website, Android and Windows builds each verified, with the check that web configuration stays out of the device builds.

## Technical notes

- Local mirrors added to `electron/db/repo.cjs` (`TABLES`, `CATALOGUE_TABLES`/`SCOPED_PULL_TABLES`, `RESTORE_TABLES`, `cloud-columns.json`) and to both local schema files, guarded so an installed till upgrades in place with no data loss.
- Settings writes move onto `dbRouter`; `src/lib/pos-rules.server.ts` and `src/lib/settings-scope.server.ts` stay as the cloud side of the same path, reached by the sync worker rather than by the screen.
- `src/lib/pos-rules.tsx` already has last-known-good and a source/status readout; it gains the local database as a first-class source.
- Approval policy stored as new fields on the existing approval-rules record; read through `usePosRules()`; enforced in `manager-gate.tsx` / `authorization.ts`.
- Offline approval rows reuse `governance-offline.ts`.
- Recovery hooks into the existing restore in `electron/sync/worker.cjs`, triggered once after activation.
- Parity report generated from `src/core/types/feature-schema.ts` via `src/lib/sync-coverage.ts` and `scripts/sync-coverage.cjs`.
- Database migration: additive columns for the approval policy; no drops, no wipes.
- Version bump per phase.

## Suggested order

Phase 1 and 2 together deliver the biggest fix (settings that survive offline and spread to other tills). Phase 3, then 4, then 5-6. Each phase ships and is tested on its own.
