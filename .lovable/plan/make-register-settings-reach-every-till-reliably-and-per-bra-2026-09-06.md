# Make register settings reach every till, reliably and per branch

## What the trace shows (read from the code and database, not assumed)

**The central database is already correct.** The rules routine builds the effective set as
built-in defaults, then the global saved row, then the branch row on top
(`pos_rules_defaults` -> `pos_rules_row('')` -> `pos_rules_row(<branch>)`), skipping unset values,
so a branch without an override inherits the global value and a branch override stays local.
Saving is supervisor-checked inside the database with a version guard. Today only the global row
exists. No database redesign is needed.

**Root cause of "the rules are not the saved ones" on phone and till.** The rules reader calls an
app-server function with a relative address. On the website that reaches a real server. Inside the
Android app and the Windows till the app is served from a local address inside the device, so that
call never leaves the device; the read fails and the reader's catch branch quietly returns the
built-in safety defaults, which look like configuration. Every other device-to-server call in this
project already goes through the configured backend address (`serverOrigin` / `posFetch`); this one
was never moved onto that path.

**Three further faults confirmed while tracing:**
- The rules request accepts whichever branch the caller names and returns it after only checking
  that the caller is signed in — no check that this person or terminal belongs to that branch.
- When no branch is known yet the code asks for branch `""` and shows the global answer as if it
  were the branch's own configuration.
- The last confirmed rules live only in memory, so restarting the phone or till drops back to the
  safety defaults.

Branch identity itself is not being changed: the persisted branch id already created with the
branch stays the authoritative identity everywhere (rules, activation, sign-in, cache, sync,
audit). I will confirm the existing creation and persistence code before touching anything, and a
rename will not change the stored id.

## What I will change

1. **One reachable read path.** Add a single endpoint that returns the effective rules for a
   branch, calling the one existing loader and the one existing database routine — no second rules
   implementation. It reuses the existing sign-in mechanisms (staff bearer or cashier session,
   terminal token where that is what the device holds) and the existing cross-origin allowance.
   Phone and till reach it through their configured backend address; the website keeps its current
   same-origin path.

2. **Branch authorisation on the server.** The request is answered for the branch the caller is
   actually entitled to. A terminal or user from one branch cannot read another branch's rules by
   naming it. Nothing secret is ever returned.

3. **Identity before configuration.** Terminal identity, branch identity and session must be ready
   before an authoritative read. Until then the state is `SYNCING` or `IDENTITY_UNAVAILABLE` —
   never "global rules presented as this branch's settings".

4. **Honest sources instead of a silent swap.** Every answer is labelled `DATABASE`,
   `LAST_KNOWN_GOOD`, `DEFAULT_SAFETY` or `UNAVAILABLE`, with states `LIVE`, `SYNCING`,
   `DEGRADED`, `NOT_VERIFIED`, `IDENTITY_UNAVAILABLE` and the existing failure categories (auth,
   network, permission, data, config, unknown). The built-in defaults remain, keep their strict
   values, and are never described as saved configuration. For unverified terminals the strict
   safety policy applies to refunds, voids, discounts, price overrides, drawer opening, cash
   variance, shift close, manager approval, negative stock, held bills and terminal reset —
   documented and tested, never accidentally permissive.

5. **Last confirmed rules survive a restart.** Store rules values, revision, sync time, terminal id
   and branch id in the existing secure device storage — no PINs, tokens, signing keys or database
   keys. A stored set belonging to a different branch is discarded, so a terminal moved between
   branches never keeps the old policy.

6. **Change on one device, applied on the others.** Keep the existing settings-change channel,
   reconnect refresh, foreground refresh and the existing periodic refresh — no extra polling. On
   an event each terminal refetches for its own branch, compares the revision, and swaps the whole
   rule set in one step only when the revision differs.

7. **One rules source for enforcement.** Audit every rule-driven action so it reads the same
   effective set as the Settings page, and confirm the server keeps the final say where it already
   does. Hardcoded numbers found on the way are classified as real configuration, system constants
   or safety defaults before anything is touched; no server check is relaxed.

8. **A supervisor status panel and structured logs** showing branch, branch id, terminal, source,
   revision, last successful sync and last failure category, plus log lines for sync start,
   success, revision change, use of last-known-good and not-verified. Identifiers only — never
   tokens, PINs, signing keys or database keys.

## Left untouched

Emergency access, manager PIN and signed approvals, terminal activation, offline operation, sales,
stock, shifts, orders, payments and existing synchronisation. No configuration or keys baked into
the phone or till builds; devices keep using their own securely stored settings.

## Technical notes

- New route `src/routes/api/public/pos-rules.ts` (existing caller verification via
  `assertCaller`-equivalent server helpers, `withCors`), delegating to `loadRulesResult`.
- Branch authorisation resolved server-side from the verified staff/cashier/terminal record; the
  client-supplied branch is validated, never trusted.
- `src/lib/pos-rules.tsx`: status/source model, persisted last-known-good keyed by terminal+branch,
  revision-gated atomic swap, transport selected by `serverOrigin()`; the existing server function
  remains the web path.
- `rulesRevision()` kept as-is: it already hashes the normalised effective set and is returned with
  every read alongside the branch id.
- Tests: global-only, branch override, two branches isolated, inheritance, override removal,
  revision change, persisted branch id reuse, rename keeps id, cross-branch read refused, missing
  identity, Windows/Electron/Android reads, temporary failure, offline restart, fresh install,
  reconnect catch-up, same-revision no rewrite, enforcement honours ON and OFF, safety policy under
  NOT_VERIFIED, and unchanged manager PIN, approval, activation and emergency access.

## Final report

Root cause; why web worked and the two device platforms did not; files and database objects
touched; branch identity confirmation and how it travels with each request; global vs branch
behaviour; sync, offline, restart, fresh install, reconnect and unavailable-identity behaviour; how
each platform obtains rules; enforcement source; NOT_VERIFIED policy; confirmation that defaults
cannot masquerade as configuration, that cross-branch access is refused, that PIN/approval/
emergency access are unchanged and no secrets are exposed; tests run and results.
