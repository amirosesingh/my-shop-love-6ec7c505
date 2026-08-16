# One System hub, hardened money paths

## Part 1 — System & General as a single in-window view

Today each diagnostic (Database health, Logic health, Security alerts, Data sync, Inheritance) is its own route, so clicking a sub-tab navigates away. Make `/settings/system` the single frame and switch panels inside it.

- Extract each page body into a reusable panel component under `src/components/pos/settings/panels/`:
  - `SystemStatusPanel` (from `settings.system.tsx`)
  - `DatabaseHealthPanel` (from `settings.diagnostics.tsx`)
  - `LogicHealthPanel` (from `settings.logic-health.tsx`)
  - `SecurityAlertsPanel` (from `settings.security-alerts.tsx`)
  - `DataSyncPanel` (thin wrapper over the existing `SyncHub`)
  - `InheritancePanel` (from `settings.inheritance.tsx`, dropping its own `AppShell`/back-link chrome since the hub supplies it)
- `/settings/system` reads a validated `?tab=` search param (`system` default, plus `database-health`, `logic-health`, `security-alerts`, `data-sync`, `inheritance`), renders the tab strip, and mounts the matching panel directly below it. Switching tabs uses `navigate({ search })` with `replace`, so there is no page reload and back/forward still work.
- The old routes (`/settings/diagnostics`, `/settings/logic-health`, `/settings/security-alerts`, `/settings/data-sync`, `/settings/inheritance`) stay as files but become permanent redirects to `/settings/system?tab=<id>`, keeping every existing deep link, sidebar entry and settings-search hit working.
- `SettingsTabs` gains support for search-param tabs so the System group renders as in-window buttons while the other groups (POS rules, Receipts, Booking rules) keep their route links unchanged.
- `src/lib/settings-groups.ts` System group entries point at the tab ids; `groupForRoute` still resolves the legacy routes so nothing else breaks.
- Remove the now-duplicated standalone "Data & Sync" entries from the settings hub grid (`settings.index.tsx`) and sidebar/nav config, leaving System & General as the single door.

### Responsive rules
Panels are audited for fixed widths: containers become `w-full max-w-full` with `min-w-0` on flex/grid children, wide tables get `overflow-x-auto` wrappers rather than fixed column pixel widths, and the relational SVG graph scales with a `viewBox` + `preserveAspectRatio` instead of a hard-coded pixel canvas.

## Part 2 — Error handling on flagged paths

- `TenderSplit.tsx`: `addTender()` wrapped in try/catch; a failed `onBeforeAdd` gate or thrown error shows an error toast and leaves the tender list untouched.
- `stock-transfers.ts`:
  - `loadTransfers()` catches and returns `[]`, reporting the failure through the shared error notifier.
  - `receiveTransferInDb()` returns `{ success: boolean; error?: string }` instead of throwing; the caller in `pos-store.tsx` (line ~1907) is updated to branch on the result and surface the message.
- `coupons.ts`:
  - `saveCampaign()` / `deleteCampaign()` return `{ success, error? }`; callers in `routes/coupons.tsx` updated to check `success` before showing the success toast.
  - `loadCampaigns`, `loadVouchers` return `[]` on error; `loadCampaignBySlug`, `loadVoucherByToken` return `null`; `loadMemberVouchers` returns `[]`. Callers in `claim.$campaignSlug.tsx`, `c.$tokenSlug.tsx` and `routes/index.tsx` already handle empty/null, and are checked so no error state regresses to a silent blank screen.
  - `slugify()` stays a pure synchronous helper (it makes no API call); it is annotated so the scanner stops flagging it.
- `routes/coupons.tsx`: `copyLink()` wrapped in try/catch, showing a toast when the browser refuses clipboard access.

## Part 3 — Refresh the report

Re-run `bun run logic:scan` and commit the regenerated `src/lib/logic-health.report.json`, so the Logic Health panel shows the resolved counts.

## Technical notes

- Panels keep their own local state and data fetching; only the mounted tab runs its effects, so opening the hub does not fire five diagnostics at once.
- Route `head()` metadata stays on `/settings/system`; the redirect stubs keep minimal metadata.
- Changed return types are a breaking signature change for coupon/transfer helpers — every call site listed above is updated in the same pass so typecheck stays clean.
