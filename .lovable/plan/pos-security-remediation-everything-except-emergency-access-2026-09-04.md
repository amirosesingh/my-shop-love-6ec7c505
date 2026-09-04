# POS Security Remediation (everything except Emergency Access)

Emergency Access / Recovery Hub is explicitly out of scope and will not be touched.

## What I verified before planning

- `.env` is tracked by git (`git ls-files` lists it) and holds the live project URL and publishable key.
- `stock_transfer_items` still carries two legacy blanket policies — `Staff read transfer items` (SELECT, `is_staff_now()`) and `Staff write transfer items` (ALL, `is_staff_now()`) — alongside the correct branch-scoped `Branch staff write transfer items`. Because Postgres ORs policies, the blanket pair defeats branch isolation entirely.
- `stock_transfers` policies (`Staff read transfers`, `Staff raise transfers`, `Staff update transfers`) check only `is_staff_now()`, with no store scoping.
- `payment_types` has `payment_types_read` with `USING (true)` granted to `public` (includes anonymous).
- Refunds in `src/lib/pos-store.tsx` (`refundSale`, ~line 1623) compute new product rows client-side from local state (`bump(...)`) and send absolute stock values to the database. There is no server-side refund quantity check and no per-item refunded-quantity tracking — a whole-bill refund can be replayed and the stock value is whatever the client says.
- Normal sales already go through the safe path: `stock_apply_delta` / `stock_apply_deltas` RPCs with an idempotency key (`src/lib/stock-recovery.ts`). This mechanism stays as-is.
- Electron `net:get-json`, `net:head`, `net:get-binary` (`electron/main.cjs:1312-1314`) pass any renderer string straight to `net.request` with `redirect: "follow"` — arbitrary origin, arbitrary protocol, private addresses, redirect chasing.

## 1. Configuration and secrets

- Stop tracking `.env` (remove from the index, keep it on disk, add it plus `.env.local`/`.env.*` to `.gitignore`); treat the committed publishable key as compromised and note key rotation as an operator action in `docs/secrets.md`.
- Keep the existing runtime-configuration architecture unchanged: web reads the injected `__POS_CONFIG__` / env, Electron and Android read their device stores. No new baked values, no service-role key anywhere client-reachable.
- Extend the existing guard test (`src/lib/__tests__/own-database.security.test.ts`) to also fail if any committed non-example env file carries a real value, and keep the artifact scanner (`scripts/verify-no-web-config.cjs`) wired into web/desktop/mobile builds.

## 2. Transfer RLS and branch isolation (migration)

- Drop `Staff read transfer items` and `Staff write transfer items`; keep only branch-scoped policies on `stock_transfer_items` and split them per command (SELECT / INSERT / UPDATE / DELETE) so each references the parent transfer's `from_store_id`/`to_store_id` through `user_has_store_access`.
- Rewrite the `stock_transfers` policies to require `user_has_store_access(from_store_id) OR user_has_store_access(to_store_id)`, with INSERT additionally requiring access to the originating store; delete stays supervisor-only plus store access.
- Add a trigger on `stock_transfer_items` that blocks re-pointing `transfer_id` at a transfer the caller cannot access, closing the parent/child bypass.
- Lifecycle transitions (approve / dispatch / receive / verify) stay in the existing `SECURITY DEFINER` RPCs, which will re-check store access for the caller instead of trusting the client.

## 3 & 4. Refunds: server-calculated, capped, idempotent (migration + app)

- Add refunded-quantity tracking on `sale_items` (`refunded_qty`, default 0, `CHECK (refunded_qty >= 0 AND refunded_qty <= quantity)`).
- New `SECURITY DEFINER` RPC `sale_refund(_sale_id, _lines jsonb, _client_refund_id text, _reason text)` that, in one transaction: locks the sale row, validates store access and refund permission, validates each sale item belongs to the sale, computes `remaining = quantity - refunded_qty`, rejects any line exceeding it, increments `refunded_qty`, applies the stock increase through the existing `stock_apply_delta` path keyed on `_client_refund_id` (so retries are no-ops), marks the sale refunded when everything is returned, and writes the audit/activity rows.
- `refundSale` in `src/lib/pos-store.tsx` calls the RPC with sale/line ids and quantities only, then refreshes products from the server response. No absolute stock value ever leaves the client. Local optimistic state is updated from the RPC result.
- The `CHECK` constraint plus row lock makes concurrent over-refund impossible at the database level; the client refund id makes retries safe.

## 5 & 6. Electron IPC hardening

- New `electron/net-allowlist.cjs`: parse with `new URL()`, require `https:` (one explicit exception for the configured local backend over `http://127.0.0.1`), match the host against the configured backend origin plus the update-feed origin, refuse private/loopback/link-local ranges otherwise, and follow redirects manually with `redirect: "manual"`, re-validating every hop. `net:get-json`, `net:head`, `net:get-binary` go through it.
- Sweep every `ipcMain.handle` in `electron/main.cjs`: add explicit argument validation (type, shape, enum, length, numeric range) with unknown fields dropped, no renderer-supplied authorization flags trusted, no arbitrary filesystem paths, and error responses that do not leak paths or credentials. `contextIsolation`, sandboxing and the narrow preload surface stay exactly as they are.

## 7, 8 & 9. Auth, RLS sweep, immutable fields

- Full policy audit across all public tables; fix the concrete offenders found: `payment_types_read` restricted to `authenticated`, and the approval-trail tables (`authorization_actions`, `authorization_requests`, `authorization_log`) gated on `is_staff_now()` / `is_supervisor_now()` in addition to `store_visible`.
- Confirm and, where missing, enforce that role and branch are not client-writable: `user_roles` and the branch/store column on `app_users` become update-blocked for the owning user via triggers, changeable only through the existing supervisor RPCs.
- Add or tighten triggers making financial and status fields immutable from direct client writes: sale totals, payment status, transfer status, approval status, inventory quantities (delta RPC only), audit rows, ownership ids and created timestamps.
- Server-side re-derivation of store/branch in `relay-policy.server.ts` stays and is extended to any path found trusting a client branch id.

## 10. Preserved

RLS stays on everywhere, Supabase Auth, session hashing and PIN hashing, Electron `contextIsolation`/preload isolation, Android configuration, per-platform runtime configuration, service-role separation, existing idempotency keys, audit logging. Nothing is suppressed or excluded from scanning.

## 11 & 12. Tests and verification

New/updated tests: transfer RLS matrix (branch A vs branch B read/insert/update/delete, plus authorised transfer still works), refund suite (correct delta, over-refund rejected, duplicate refund idempotent, concurrent refunds capped, client-supplied absolute stock ignored), Electron URL allowlist (protocol, origin, private address, redirect to private destination) and IPC argument validation, authorization tests (self role change rejected, self branch change rejected, unauthorised manager operation rejected), and config tests (no secrets in web/Electron/Android bundles).

Then: `tsgo` typecheck, ESLint, full vitest run, web build, desktop and mobile build scripts with the existing artifact secret scanner, and a diff check confirming no Emergency Access file changed. Version bumped with `node scripts/bump-version.cjs`.

## 13. Report

A final remediation report per finding — severity, status (fixed / partially fixed / not fixed / false positive), what changed, tests — plus the list of files changed, every migration/policy/trigger/function/constraint added, the security impact of each change, and an explicit note that Emergency Access was intentionally left unchanged.

## Order of work

1. Git/secrets hygiene and guard test.
2. Migration A: transfer RLS + parent/child trigger.
3. Migration B: refund tracking, `sale_refund` RPC, immutability triggers, `payment_types`/authorization policy fixes.
4. App wiring for the refund RPC.
5. Electron allowlist + IPC validation sweep.
6. Tests, builds, report.
