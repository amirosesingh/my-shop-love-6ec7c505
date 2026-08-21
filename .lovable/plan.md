# Phase 1 report — three sync errors, root causes only (no code changed)

## Issue A — "column updated_at is specified more than once" (local SQL Server)

**Root cause: code-side, one function.** `electron/db/repo.cjs`, `upsertRow()`
(lines 174-221). The `UPDATE SET` list is built from the incoming row's own
columns:

```
columns  = Object.keys(record) minus SYNC_COLUMNS, kept if the table has them
setList  = columns (except id) mapped to  t.[c] = s.[c]
           .concat("t.[updated_at] = SYSUTCDATETIME()")   <-- always appended
```

`SYNC_COLUMNS` is only `is_synced, sync_status, synced_at, sync_error`.
`updated_at` is **not** in that set, so whenever the incoming row carries
`updated_at` the clause contains both `t.[updated_at] = s.[updated_at]` and
`t.[updated_at] = SYSUTCDATETIME()` — exactly what ODBC Driver 18 rejects.

- **Which ops trigger it:** any row that arrives with an `updated_at` value.
  In practice that is the pull path — `mergeFromCloud()` (line 428) calls
  `upsertRow(..., { markPending: false })` for every cloud row, and every cloud
  row has `updated_at`. Local writes hit it too whenever the caller includes
  `updated_at` in the payload.
- **Which tables:** not table-specific. It fires for any mirrored table whose
  local definition has an `updated_at` column, i.e. effectively all of them —
  the first table in the pull order aborts the batch, which is why it reads as
  one recurring error.
- **Other auto-maintained columns:** `is_synced`, `sync_status`, `synced_at`
  and `sync_error` are safe because they are filtered out of `columns` before
  the extra assignments are appended. `row_version` is safe on the local-write
  path (explicitly filtered when `markPending`) and on the pull path it is
  assigned only once, from `s`. `created_at` is never re-assigned. So
  `updated_at` is the single column with the duplicate pattern.
- **`updateRows()` (line 223-245)** has the same shape: caller-supplied `SET`
  fields plus an appended `[updated_at] = SYSUTCDATETIME()`. It has not fired
  yet only because current callers don't pass `updated_at`; it is the same
  latent bug.
- **Not the cloud path.** The Postgres side upserts through PostgREST with a
  JSON object, so a key can only appear once; `markSynced()` (`updated_at =
  updated_at`) and the `sync_metadata` / `sync_state` / `system_settings`
  MERGEs each assign the column exactly once. Local `repo.cjs` only.

**Was the data synced?** No for this direction. Pull runs inside a transaction
(`mergeFromCloud`) and rolls the batch back on the error, so nothing landed
half-written and the watermark did not advance — a later pull will re-fetch the
same rows. Push (local sales going up) is a separate routine and was not
affected by this error.

## Issue B — `stock_reconcile` not found in the schema cache

**Root cause: the app is pointed at a different Supabase project than the one
the migrations were applied to.** `src/lib/stock-recovery.ts` line 11 imports
`supabaseExternal` (`src/integrations/supabase/external-client.ts`), which is
the user's *own* project resolved through `src/lib/external-supabase-config.ts`.
Live traffic in the preview goes to `qhrufhtbeguxydenzfey.supabase.co`, while
`.env` / the managed backend is `ydgnmkzhgvtudfpzmylq`.

- **What the client sends:** `rpc("stock_reconcile", { _store_id: storeId })` —
  one argument, name `_store_id` (line 306).
- **What the migration deploys:**
  `supabase/migrations/20260820162215_...sql` line 73 —
  `public.stock_reconcile(_store_id text, _since timestamptz DEFAULT ...)`
  with EXECUTE granted to `authenticated` and `service_role`. The generated
  types agree (`Args: { _since?: string; _store_id: string }`).
- So the call and the definition match exactly. The function is simply **not
  present in the project the app is talking to** — that migration was never
  applied there. Consistent with the reported wording `stock_reconcile(store_id)`:
  PostgREST reports "no such function" when no candidate exists at all.
- Not a parameter-name mismatch, and a cache reload alone will not help unless
  the function is actually created there first.

## Issue C — PGRST204 `device_name` on `branch_telemetry`

**Same root cause as B: schema drift on the external project.**

- **The write:** `publishTelemetry()` in `src/lib/telemetry.ts` (line 105),
  `supabase.from("branch_telemetry").upsert(snapshot(...), { onConflict:
  "terminal_id" })`, mounted globally by `src/components/pos/TelemetryAgent.tsx`
  on a 60-second heartbeat.
- **Payload columns (25 → 21 sent):** terminal_id, store_id, terminal_name,
  device_name, device_type, location_name, session_status, last_heartbeat_at,
  staff_name, staff_role, db_mode, connection_status, storage_engine,
  pending_count, conflict_count, last_synced_at, app_version, platform,
  last_seen_at.
- **Managed project (queried live)** has all of them, including `device_name`,
  `device_type`, `location_name`, `session_status`, `last_heartbeat_at`.
- **Repo migration** `20260816082847_...sql` creates the table with only the
  original 16 columns; the five newer ones exist in the managed database but
  have **no migration file in `supabase/migrations/`**, so nothing in the repo
  would ever add them to a second project.
- Names match exactly (case and underscores) — this is a missing column on the
  external project, not a rename. PostgREST names `device_name` because it is
  the first unknown key in the payload; `device_type`, `location_name`,
  `session_status` and `last_heartbeat_at` are missing there too.

## Summary

| Issue | Where | Kind |
| --- | --- | --- |
| A | `electron/db/repo.cjs` `upsertRow` (and latent in `updateRows`) | Code bug — duplicate `updated_at` assignment |
| B | `stock_reconcile` absent on the external project | Schema drift — migration not applied there |
| C | 5 `branch_telemetry` columns absent on the external project, and no migration file for them | Schema drift + missing migration in the repo |

Neither B nor C is a stale PostgREST cache: the objects are genuinely absent
from the database the app connects to.

## What a Phase 2 fix would cover

1. De-duplicate the `SET` list in `upsertRow`/`updateRows` and choose
   `updated_at` by direction (local write → server clock; cloud pull → keep the
   cloud value so watermarks stay honest), with a regression test.
2. Add a repo migration for the five `branch_telemetry` columns and re-apply
   the reconcile-function migration, then run both against the external project
   so it matches the managed schema.
3. Confirm which project the till should be pointed at, since that choice
   decides whether step 2 is a one-off catch-up or an ongoing requirement.
