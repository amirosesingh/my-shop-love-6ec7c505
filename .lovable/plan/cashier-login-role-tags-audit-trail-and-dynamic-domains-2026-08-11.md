# Cashier login, role tags, audit trail and dynamic domains

## Codebase scan — what is actually there

- **Cashier sign-in does not use Supabase email/password.** The till posts `{username, pin}` to `cashierLoginServer` (`src/lib/cashier-login.server.ts`), which calls the database routine `verify_terminal_pin` with the service key (bcrypt compare) and mints its own device session. Admin/supervisor email sign-in is the only path that uses Auth email + password.
- **Root cause of rejected cashier PINs:** account creation accepts a 4–32 character credential (`src/lib/staff-admin.server.ts`, stored `pin_length`), but the login server hard-rejects anything that is not exactly 4–6 digits (`/^\d{4,6}$/`). Any 7+ digit or alphanumeric passcode fails before it ever reaches the database. The keypad screen also caps entry at 6 dots and unlocks the button at 4 characters, so long passcodes cannot be typed on the keypad at all.
- **Permissions** already exist as a granular matrix (`src/lib/permissions.ts`) plus an admin-controlled visibility map per role (`src/lib/ui-visibility.ts`, `/settings/visibility`). There is no separate "tag" concept; tags would duplicate it unless they are layered on top of these two.
- **Activity trail** exists (`audit_logs`: user name, category, action, module, JSON details) and is insert-only. It has no actor id/role, no before/after values and no terminal column — so "who changed this price from X to Y on which till" cannot be answered today.
- **Domains:** member/redeem subdomains are already editable in `/settings/system`, but `src/lib/coupon-hosts.ts` still hardcodes `member.luckycharmsdnbhd.com` / `redeem.luckycharmsdnbhd.com` as the fallback and for host detection, so the saved values are ignored by the link builders. Internal login domains (`pos-internal.local`, `pos.local`) are deliberate non-deliverable placeholders and stay hardcoded.

## Phase 1 — Cashier sign-in repair

- Accept the credential the account actually has: replace the 4–6 digit rule in `cashier-login.server.ts` with 4–32 characters, matching provisioning. No client-side hashing is added anywhere; the raw value goes to the database routine, which does the bcrypt compare.
- Keypad screen honours the stored length: dots follow `pin_length` (up to 12 shown), submit enables at the stored length, and accounts with a longer/alphanumeric passcode open the typed field automatically.
- Failure messages separate "no such user", "wrong PIN", "account deactivated" and "cannot reach the database" so a rejection is diagnosable, while keeping the existing lockout counter.

## Phase 2 — Roles, permissions and tag-based settings

- Publish one source of truth: a role-to-permission defaults map (Owner/Admin, Manager, Supervisor, Cashier, Warehouse) in `src/lib/permissions.ts`, applied when an account is created and shown as a preset in the Accounts screen.
- Add **tags** as a thin layer over the existing matrix: each settings page and each register/inventory element declares tags (`cashier-visible`, `supervisor-only`, `reports-access`, `admin-only`). The settings hub, sidebar and register cards filter on the signed-in person's role plus the admin's visibility map, so revoking a tag hides the tab, its buttons and its route.
- Route guards keep enforcing the permission itself, so hiding a tab never becomes the only protection.

## Phase 3 — Reports and an immutable edit log

- New database table `system_audit_logs`: timestamp, actor id, actor role, action type, entity affected, old value, new value, terminal/IP — insert-only, readable by supervisors and above, with no update or delete grant for anyone.
- Write to it from the places that change money or access: price override, discount, void, refund, manual shift edit, account create/edit/delete, permission change, and every login attempt (success and failure).
- New "Edit history" screen under Reports, filterable by person, action and date, with a plain-language before/after column.
- Reports & analytics gains the missing measures: gross vs net sales, discount and void totals, and shift reconciliation (counted vs expected cash) alongside the existing charts.

## Phase 4 — Dynamic domains

- `coupon-hosts.ts` reads the member/redeem hosts saved in settings instead of the hardcoded company domain, with host detection driven by the same values; the hardcoded strings are removed.
- The domain section in `/settings/system` gains validation, a live preview of the resulting join/claim/voucher links, and a copy-ready list of redirect URLs an admin must allow for sign-in.
- Redirect handling uses the current window origin rather than a fixed host, so no environment forces a redirect loop.

## Technical notes

- Files touched: `src/lib/cashier-login.server.ts`, `src/components/auth/CashierPinLogin.tsx`, `src/lib/permissions.ts`, `src/lib/ui-visibility.ts`, `src/routes/settings.index.tsx`, `src/components/pos/SidebarNav.tsx`, `src/lib/audit-log.ts`, new `src/lib/system-audit.ts`, new reports route, `src/lib/coupon-hosts.ts`, `src/routes/settings.system.tsx`.
- One migration creates `system_audit_logs` with grants (supervisor/admin read, service role insert), row-level security and no update/delete policy; a companion file lands in `supabase/sql/` for offline installs.
- Electron parity: the new table is added to the local schema and the pull list so desktop tills keep working offline.

Out of scope: changing the cashier flow to Supabase email+password. The till deliberately avoids Auth so it can sign in offline and without exposing Auth to shared devices; the fix keeps the existing server-verified path.
