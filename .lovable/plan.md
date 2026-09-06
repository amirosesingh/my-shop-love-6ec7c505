# Make register settings reach every till reliably

## What I found (traced, not assumed)

**The central database is fine.** The rules routine builds the effective set correctly:
built-in defaults, then the global saved row, then the branch row on top
(`pos_rules_defaults` -> `pos_rules_row('')` -> `pos_rules_row(<branch>)`). Only nulls are
skipped, so a branch with no override inherits the global value automatically, and a branch
override stays inside that branch. Saving is supervisor-checked inside the database with a
version guard. Today the database holds exactly one saved row: the global one — no branch has
its own overrides yet.

**The real fault is how phones and tills ask for the rules.** The rules are fetched through an
app-server call that uses a *relative* address. On the website that lands on a real server, so
Windows/web works. Inside the Android app and the Windows till the app is served from a local
address inside the device, so that same call never reaches the hosted server: it answers with the
app shell or nothing. The reader then falls into its catch branch and hands back the strict
built-in defaults, which is exactly the "hardcoded rules" behaviour reported.

Every other device-to-server call in this project already goes through the configured backend
address (`serverOrigin` / `posFetch`). The rules reader is one of the calls that was never moved
onto that path.

**Two smaller faults follow from it:**
- The last confirmed rules are kept only in memory, so an app restart on a phone or till drops
  back to the built-in defaults.
- When no branch is known yet, the code asks for scope `""` and presents the global answer as if
  it were the branch configuration.

## What I will change

1. **One reachable way to read rules.** Add a small read endpoint under the public API path that
   returns the effective rules for a branch, protected the same way the existing settings
   endpoint is (staff bearer or cashier session, cross-origin allowance, no keys ever returned).
   The rules reader calls it through the configured backend address on phone/till, and keeps the
   existing same-origin path on the website. No second rules system: both routes call the one
   existing loader, which calls the one database routine.

2. **Honest status instead of a silent swap.** The reader will report one of:
   `LIVE`, `SYNCING`, `DEGRADED` (last confirmed rules in use, refresh failed),
   `NOT_VERIFIED` (never synced — safety defaults), `IDENTITY_UNAVAILABLE` (no branch yet),
   plus the existing failure categories (auth, network, permission, data). The built-in defaults
   are only ever labelled safety defaults, never presented as saved configuration.

3. **Last confirmed rules survive a restart.** Store them locally against terminal id, branch id,
   revision and sync time, using the existing secure device storage. On start: identity first,
   then the stored set, then a refresh from the centre. A stored set belonging to a different
   branch is discarded, so a terminal moved to another branch never keeps the old policy. Nothing
   secret is stored — only the rule values.

4. **Change on one device, applied on the others.** Keep the existing live settings channel,
   reconnect refresh and periodic refresh. On an event a terminal refetches for *its own* branch,
   compares the revision, and only rewrites its stored copy when the revision differs — replaced
   in one step, never half old and half new.

5. **One rules source for enforcement.** Confirm every rule-driven action (shift close, held
   bills, drawer, discounts, price override, refunds, voids, negative stock, manager PIN, cash
   variance, terminal reset) reads the same effective set, and that the server keeps the final
   say where it already does. No relaxing of server checks.

6. **A status panel for supervisors** showing branch, terminal, source, revision, last successful
   sync and last failure category — no tokens, keys or PINs.

## Left untouched

Emergency access, the manager PIN and signed-approval mechanism, terminal activation, offline
operation, sales/stock/shift behaviour, and the cashier login screen. No configuration or keys
baked into the phone or till builds; the device keeps using its own securely stored settings.

## Technical notes

- New route `src/routes/api/public/pos-rules.ts` (bearer or cashier token, `withCors`), calling
  the existing `loadRulesResult`.
- `src/lib/pos-rules.tsx`: status model, persisted last-known-good keyed by terminal+branch,
  revision-gated atomic swap, transport chosen by `serverOrigin()`.
- `src/lib/pos-rules.server.ts`: revision already hashes the effective set; keep as the sync
  identity and return it on every read.
- Structured failure logging (`POS_RULES_LOAD_FAILED category=… platform=… branch=…`) with
  identifiers only.
- Tests: global-only, branch override, two branches isolated, override removal falls back to
  global, restart offline, fresh install, reconnect catch-up, same-revision no rewrite, missing
  or changed branch identity, and a check that saved rules are not replaced by defaults.

## Report at the end

Root cause, files and database objects touched, per-platform explanation, branch/global
behaviour, sync, offline and fresh-install behaviour, and test results.
