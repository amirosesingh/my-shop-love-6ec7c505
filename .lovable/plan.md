# Settings drawer refactor, hidden telemetry recovery, branding & mobile notch

## Audit results (what I found)

- **Live Terminal / Branch Telemetry exists** at `/settings/branch-telemetry` (real table `branch_telemetry`, remote commands via `terminal_commands`). It is reachable only from the sidebar's admin group — it is missing from the Settings hub grid, which is why it looks "hidden".
- **There is no `src/lib/company-settings.ts`.** Company identity lives as `receipt.companyName` inside the single `pos_settings` row; the desktop shell also caches a local `pos.branding` record. There is **no logo image anywhere** — receipts draw a box of initials (`pos-print.ts`), not an image.
- **No realtime listener on settings.** Saving pushes to the database, but other devices only pick it up on their next load/sync, which is the reported "name doesn't update across terminals".
- **Settings hub navigates away**: every card in `src/routes/settings.index.tsx` is a `<Link>` to a separate route.
- **Mobile header already has safe-area padding** (`pt-safe` + `sticky top-0`) in `AppShell`, but it is applied to only the mobile header; the sticky bar inside the settings page and the customer display screen have no safe-area handling.

## What changes for the user

1. **Settings open in place.** Clicking a card slides a right-side panel over the current page — adjust, save, close, never leaving `/settings`. Existing routes stay valid as deep links.
2. **Six quick-access cards** at the top of Settings: Company Branding & Logo, Live Terminal & Branch Telemetry, Hardware & Printers, Payment Methods & Vouchers, Integrations & APIs, Staff Roles & PIN Security. The existing categorised list stays below.
3. **Company branding.** Upload a transparent PNG logo and set the company name in one place. The logo appears on receipts, the POS header and the customer display. Changes appear on every connected screen within a second — no reload.
4. **Mobile notch.** Headers clear the camera cut-out and stay pinned while scrolling on phones and tablets.

## Technical plan

**Phase A — in-place drawer**
- New `src/components/pos/settings/SettingsDrawer.tsx`: a `<Sheet side="right">` (`w-full sm:max-w-2xl`, scrollable body) that renders a panel component by id.
- New `src/components/pos/settings/QUICK_CARDS.ts`: the 6 card definitions (id, label, blurb, icon, permission flag, panel component, `deepLink` for the fallback route).
- `src/routes/settings.index.tsx`: render the quick-card grid above the existing groups; a card click sets `openPanel` state (drawer) instead of navigating. Search results for these 6 also open the drawer. All other cards keep their current `<Link>`.
- Panel bodies are extracted, route-free components under `src/components/pos/settings/panels/`:
  - `BrandingPanel.tsx` (new), `TelemetryPanel.tsx` (extracted from `settings.branch-telemetry.tsx`), `HardwarePanel.tsx` (from `settings.hardware.tsx`), `PaymentMethodsPanel.tsx` (from `settings.payment-methods.tsx`), `IntegrationsPanel.tsx` (WhatsApp creds + existing connection test from `settings.whatsapp.tsx`), `StaffSecurityPanel.tsx` (role/PIN section reusing `RoleManager`/`StaffManager`).
  - Each existing route file then renders its panel inside `SettingsFrame`, so nothing is duplicated and deep links keep working.
- Each panel reuses the existing `SaveIndicator` + `db.saveSettingsNow` save path; no new save mechanics.

**Phase B — branding**
- Add `logo?: string` (base64 data URL) and keep `companyName` on `ReceiptSettings`; persist through a new `logo_data_url` text column on `pos_settings` (migration) plus the existing mapping in `pos-db.ts`.
- Upload handling in `BrandingPanel`: accept `image/png` only, reject non-transparent-capable types, downscale via canvas to max 512px and ~150 KB, store as data URL. Preview with a checkerboard so transparency is visible.
- `src/lib/pos-print.ts`: when `showLogo` and a logo exists, print `<img>` instead of the initials box (initials remain the fallback).
- `AppShell` header and `/display` render the logo + company name from settings, falling back to local branding.
- Realtime: new `src/lib/settings-realtime.ts` subscribing to `postgres_changes` on `pos_settings` (using the existing external Supabase client, guarded when offline/desktop-local). On an update from another device, patch the local settings store — no reload. Started once in `AppShell` next to the existing sync engine start.
- Branch isolation is untouched: only the global `pos_settings` row carries branding; `stores`, terminal ids and per-branch overrides are unchanged.

**Phase C — mobile safe area**
- Apply `pt-safe` + `sticky top-0 z-50` consistently: settings page sticky bar, `/display`, and any drawer/sheet header on mobile; add `px-safe` to the mobile header so buttons clear rounded corners.
- Center the header logo/title block with the grid pattern (`grid-cols-[auto_minmax(0,1fr)_auto]`, `min-w-0`, `truncate`) so nothing clips on narrow screens.

**Version:** bump `package.json` + `src/version.ts` to 1.3.7.

Out of scope: no change to what any individual setting does, to permissions, or to the sync/outbox layer.
