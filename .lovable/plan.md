# Fix the stuck activity-log sync

## What is happening

Activity entries are written to this terminal first, then pushed to the central
database in batches of 50. That push uses a plain insert with the entry's own id.
If a batch already reached the database once (for example the reply was lost on a
flaky connection, or the same entry was pushed from a restored/duplicated local
store), the database rejects the whole batch with
`duplicate key value violates unique constraint "audit_logs_pkey"`.

Because the batch fails, none of those 50 entries are marked as synced, so the
same batch is retried every 3 seconds / 30 seconds and fails forever. The queue
never drains and the console fills with `[audit] sync failed`.

## The fix

1. In the audit push (`src/lib/pos-db.ts` → `pushAuditLogs`), replace the plain
   insert with an upsert keyed on the entry id, ignoring rows that already exist.
   An entry that is already in the central database then counts as delivered
   rather than as a failure. This is safe: audit rows are append-only and the id
   is generated on the terminal, so re-sending the same id can only ever mean
   "same entry".
2. In `src/lib/audit-log.ts`, treat a duplicate-key response (code `23505`) as a
   successful delivery for that batch, so any entries already stored are marked
   synced and the queue moves on instead of blocking behind them.
3. Drop the noisy `console.error` for the duplicate case; genuine failures still
   log once.

No database schema change is needed and no existing audit rows are touched or
removed.

## About the second message

`{"message":"No API key found in request"}` is a separate, unauthenticated
request — not part of the audit push. After the audit fix lands, I will check the
network panel to identify which call is missing its key and report back before
changing anything else.

## Technical notes

- `pushAuditLogs` becomes `.upsert(rows, { onConflict: "id", ignoreDuplicates: true })`.
- `flushBatch` keeps returning the batch ids on success; on a `23505` error it
  returns the same ids instead of throwing, so `synced_to_cloud` is set.
