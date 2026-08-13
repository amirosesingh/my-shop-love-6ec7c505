# Fix: sync relay refuses admin/supervisor callers (403)

## What I checked

- `/api/v1/pos/sync` (and the legacy `/api/public/sync` alias) both run `handleSyncRequest`, which proves the caller, resolves a scope, then authorises each operation.
- The endpoint returns **403** only when an operation is denied with `STORE_FORBIDDEN`, `PERMISSION_DENIED`, `SCOPE_MISSING` or `SCOPE_STALE` — i.e. the caller was recognised but not treated as an admin/supervisor.
- I could not read the live shop database from here (this workspace is linked to a different, empty database), so the diagnosis below comes from reading the code path. Step 4 adds the logging needed to confirm it on the live server.

## Two concrete gaps in the caller-identity logic

**1. A till token outranks the signed-in admin.**
Caller verification returns the *first* credential it can prove, in this order: session token, cashier token, terminal token, staff account token. The browser sends all of them together. So on an activated terminal (desktop shell or Android till), an admin signed into their staff account is still identified as a terminal — and a terminal caller has no staff record, so it gets **no permissions and no supervisor status**. Every permission-gated write (product prices, stock adjustments, purchase orders, members, refunds) and every cross-branch write is then refused with 403, which matches "many things are not working".

**2. Staff accounts are never matched by email.**
When the scope is resolved from a staff account token, the staff record is looked up by `auth_user_id`, then `user_id`, then the login label — which for an email sign-in is the email address. There is no lookup on the `email` column. If `auth_user_id` was never filled in for that admin, no record is found, the scope is marked stale, and the relay answers 403 "Your account details could not be confirmed".

## The fix

1. **Collect every proof, then pick the strongest identity.** Rework caller verification so it evaluates all presented credentials instead of stopping at the first: a proven staff account (or staff session) always supplies the *identity, role and permissions*; a terminal token supplies the *branch* the device is physically bound to. An admin on a till is then an admin, still pinned to that till's branch for ordinary writes but with supervisor reach where their role allows it.

2. **Add an email fallback to scope resolution.** Look the staff record up by `email` as well as `auth_user_id`, `user_id` and label, so an admin whose account was never linked to the auth id still resolves correctly.

3. **Never treat a proven supervisor as stale.** If the role resolves to admin/manager/supervisor from either the account record or the token claims, the request proceeds instead of being refused for missing details.

4. **Make refusals diagnosable.** Include the table, the operation kind and the failing check in the 403 response body (never any token or key), log a one-line server-side reason, and surface it in the sync/connection panel so the exact refusal is visible instead of a bare "403 Forbidden".

5. **Verify.** After deploying, sign in as an admin on a till and in a plain browser, run the connection-check probe, and confirm a product price edit, a stock adjustment and an audit-log push all return 200; confirm a cashier account is still refused for the same actions.

## Technical notes

- Files touched: `src/lib/pos-relay.server.ts` (caller verification order), `src/lib/relay-policy.server.ts` (scope resolution, email lookup, supervisor short-circuit), `src/lib/sync-endpoint.server.ts` (denial detail in the response), plus the connection-check panel for display.
- No change to the branch-pinning rules: cashier and terminal callers stay locked to their own branch, and every row is still stamped with the verified actor. This only stops a legitimate admin from being downgraded to an anonymous terminal.
- No database migration required.