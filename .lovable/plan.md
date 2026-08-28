# Configurable authorization: per-user PINs, sensitive actions, and approvals

Read-only review is done. Below is what exists today, then what I propose to build. Nothing has been changed.

## 1. Current auth model

- **Cashiers / staff at the till**: username + numeric PIN. The PIN is hashed (bcrypt) in `app_users.pin_hash` (and legacy `cashiers.pin_hash`) and only ever compared inside the database (`verify_cashier_pin`, `verify_terminal_pin`). The till gets a signed session token back; the PIN never reaches the browser's memory beyond the keypad.
- **Admin / supervisor**: email + password through the central account system (a real session with an access token). They do not have a PIN as a login method.
- **A per-user PIN concept already exists**, but only for staff sign-in and for the manager override. `verify_manager_pin(user_id, pin, ...)` checks the same `pin_hash` and only accepts people whose role is admin/manager or who hold `can_access_pos_settings` / `can_manage_staff`. So admins do have a PIN slot — most simply never set one, and `pin_length` records whether one is set.
- **Permissions**: ~60 granular flags stored as JSONB per user, grouped in `permissions.ts`, with role presets from the `staff_roles` table (4 built-in + custom roles).
- **Existing gating**: two layers.
  - *Permission layer* — the user's own flags (`can_void_cart`, `can_override_price`, …); refusal is explained by `PermissionGate.tsx`.
  - *Manager PIN layer* — `manager-gate.tsx` + `ManagerOverrideDialog`, driven by boolean rules per branch: refund, void cart, void line, reduce qty, manual discount, price override, no-sale drawer, stock adjustment, shift close, edit tenders, terminal unpair; plus threshold rules (max cashier discount %, max flat discount, variance limit). Admins bypass the prompt and the bypass is logged. Approvals are recorded by `log_manager_override` into `audit_logs`.
  - *Not yet gated, only marked*: "Edit posted Stock Operations record" and "Edit posted Purchasing/GRN record" currently show a lock badge and a toast saying approval will be required — the hooks are waiting for this system.

**Actions I found that should be in the configurable list** (you decide the final set):
refund, void cart, void line, reduce quantity, manual discount, discount above the cashier limit, flat discount above the amount limit, price override, below-cost sale, tax exemption, no-sale drawer open, stock adjustment / post count, shift close, shift close over variance limit, edit split tenders, terminal unpair, edit posted stock operation, edit posted purchasing record, discard a draft after items were added, delete a product, member points adjustment.

## 2. Proposed data model

**PIN for every user** — reuse `app_users.pin_hash` / `pin_length` rather than a second column, so one PIN is never out of step with another. Changes:
- `set_app_user_pin` becomes usable for admin/supervisor accounts too (today's staff-management UI hides the field for them).
- New `app_users.pin_set_at`, `pin_updated_by` for audit.
- The PIN stays **authorization-only** for admin/supervisor: the login path is untouched and continues to require the password.

**`authorization_actions`** — one row per sensitive action, per settings scope (global / cluster / branch, matching the existing inheritance chain):
`action_key`, `scope_type`, `scope_id`, `mode` (`none` | `pin` | `request` | `either`), `allowed_roles text[]`, `allowed_user_ids text[]`, `require_reason bool`, `threshold numeric` (for the "above X%" actions), `is_enabled`, timestamps.

**`authorization_requests`** — the pending queue:
`id`, `action_key`, `requested_by`, `requested_by_name`, `store_id`, `terminal_id`, `reason`, `payload jsonb` (what the action would do), `status` (`pending` | `approved` | `rejected` | `cancelled` | `expired`), `decided_by`, `decided_at`, `decision_note`, `expires_at`, `consumed_at` (a grant is single-use), timestamps.

**`authorization_log`** — one row for every authorization attempt whatever the mode:
`action_key`, `mode_used` (`pin` | `request` | `admin_auto`), `requested_by`, `authorized_by`, `authorizer_role`, `store_id`, `terminal_id`, `outcome` (`approved` | `rejected` | `failed_pin` | `denied`), `detail jsonb`, `created_at`. Insert-only, no update/delete. The existing `log_manager_override` writes forward into this table so today's history and tomorrow's live in one place.

All three get grants + RLS: read for signed-in staff scoped to visible branches, write only through security-definer routines (`authorization_request_create`, `authorization_decide`, `authorization_verify_pin`), never direct table writes from the client.

## 3. Settings screen

A new **Authorization rules** panel inside the existing security settings area (extending `/settings/rules`, keeping the current toggles as the "PIN only" preset so nothing regresses). It lists every sensitive action grouped by area (Sales, Cash & shift, Inventory, Records & edits, Admin), and for each row:
- Mode selector: None / PIN only / Approval request / Either.
- Threshold field where the action has one (discount %, flat amount, variance).
- "Who may authorize": multi-select of roles plus a multi-select of named users.
- Optional "require a reason".

It uses the existing scope selector and inherited-field controls, so a branch can override the global rule the same way every other setting does.

## 4. In-context authorization prompt

One replacement for `ManagerOverrideDialog`, resolved by an extended `manager-gate.tsx`:
1. Mode `none` → runs immediately (the user's own permission still applies).
2. Requester is an admin **and** the admin auto-approve rule is on → runs, logged as `admin_auto`.
3. Mode `pin` → PIN dialog: user ID + PIN, verified server-side against the action's allowed roles/users, returning a short-lived single-use grant. Wrong PINs are throttled by the existing lockout.
4. Mode `request` → "Submit for approval" form (reason + summary of what will happen). The action does not proceed; the caller gets a request ID and a "waiting for approval" state.
5. Mode `either` → one dialog with two tabs: "Someone's here — enter PIN" and "Send for approval".

Actions that can complete later (edit posted record, discard draft, stock post) keep their draft/pending state until the request is decided; instantaneous till actions (void, discount) practically only use PIN or Either.

## 5. Pending Approvals view

- A new `/approvals` screen plus a badge in the top-bar status cluster, visible to anyone whose role or user id appears in any action's authorizer list.
- Lists pending requests with action, requester, branch, terminal, reason, a readable summary of the payload, and age; filterable by branch and action.
- Approve / Reject with an optional note, decided from their own signed-in session — no PIN needed, because they are already authenticated.
- Live updates through the existing realtime/polling channel, plus refresh on window focus. Requests expire after a configurable window.
- The requester's session sees the decision and can then complete the action, consuming the single-use grant.

## 6. Risks

- **Role/permission logic**: unchanged. The new layer sits *after* the permission check — a user still needs their own flag; authorization only covers the extra step. No existing permission key is renamed or removed.
- **Existing PIN rule toggles**: they are migrated into `authorization_actions` as `mode = 'pin'` / `'none'`, and the old rule keys stay readable so an older till build keeps working. Risk of a gate accidentally opening during migration — mitigated by defaulting anything unmapped to the more restrictive setting.
- **Tasks 3–4 drafts**: the draft/autosave and posting flows are not touched. Only the already-marked "Edit posted record" buttons become live gates, and posting itself keeps its current `stock_adjustment` gate.
- **Offline**: PIN mode needs the database to verify, exactly like today's manager override. Approval-request mode is online-only; offline it will say so rather than queue an unverifiable approval.
- **Audit continuity**: existing `audit_logs` override rows are left in place; the new log starts alongside and both are shown in the audit screen.

## Technical notes

- Migration `supabase/migrations/<ts>_authorization_framework.sql`: three tables with GRANTs + RLS, `authorization_verify_pin`, `authorization_request_create`, `authorization_decide`, `authorization_pending`, `set_app_user_pin` extension, and a data step mapping the current `require_pin_*` rules into `authorization_actions`.
- Mirror into `electron/db/offline_sqlite_v2.sql` and `db/offline/pos-offline-sqlserver.sql` plus a new `db/offline/migrations/` file, and register the tables in `src/lib/central-schema.ts` and `feature-schema.ts` so the schema manager sees them.
- New `src/lib/authorization.ts` (action catalogue + types), `authorization.functions.ts` / `.server.ts`, rewritten `src/lib/manager-gate.tsx`, new `AuthorizationDialog.tsx`, `src/routes/approvals.tsx`, and an authorization section in `src/routes/settings.rules.tsx`.
- Version bump via `node scripts/bump-version.cjs`.

## Open questions

1. Confirm the final sensitive-action list from section 1 — anything to add or drop?
2. Should an admin attempting a gated action still be auto-approved without a prompt (today's behaviour), or should admins also be prompted?
3. Should a set PIN be mandatory for admin/supervisor accounts, or optional?
4. How long should a pending request stay open before it expires, and should the requester be able to cancel it?
