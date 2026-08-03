# Section hub pages, terminal delete, and one-time activation codes

## 1. Every sidebar group opens a hub page

Today only "System & Settings" has a landing page with cards; the other groups just expand a list. Each group gets the same treatment.

New hub pages, styled exactly like the settings hub (sticky back button, card grid with icon, title and one-line description):

- `/sales` — Sales & Operations: Register POS, Live Dashboard, Shift Management, Bookings / Pay Later, Customer Display, Bill Search & History
- `/inventory-hub` — Inventory & Supply: Inventory Catalog, Purchasing, Stock Transfers, Locations / Warehouses
- `/customers` — Customers & Marketing: Member Directory, Promotions & Discounts
- `/admin` — Staff & Admin: Staff Management, Audit Logs & Activity
- `/reports` — already a Reports Centre; restyled to the same card layout so all hubs match
- `/settings` — unchanged (already the hub)

Sidebar behaviour:

- Clicking a group header navigates to that group's hub page **and** toggles the sub-item list, so both ways of getting around still work.
- Cards respect the same permission flags as the sidebar entries, so a cashier only sees what they may open. A hub with no permitted items is not reachable.
- The collapsed (icon-only) sidebar keeps its hover popover, with the group title in the popover now linking to the hub.

## 2. Delete a revoked terminal

In Settings → Terminal activation:

- Revoked rows gain a **Delete** action next to Re-enable / Re-issue code, behind a confirmation dialog ("Permanently remove this terminal entry?").
- Only revoked (or already-used) rows can be deleted — an active terminal must be revoked first, so a live till is never cut off by accident.
- Deletions are written to the audit log with device name, location and who did it.

## 3. Activation codes are single use

Right now a code can be pasted into several machines. Change it to one-time:

- A token gets a third status, **used**, set the moment a till successfully redeems it, together with the device name of that till.
- A second machine trying the same code gets: "This activation code has already been used on another terminal." The original till keeps working — its heartbeat accepts both `active` and `used`.
- The tokens table shows the new status badge (Active / In use / Revoked) plus which terminal claimed it.
- When a terminal is revoked, or a code is otherwise spent, the way back is **Re-issue code** — which already exists and now becomes the standard flow: it retires the old row and hands out a fresh single-use code for the same device name and location.

## Technical notes

- New routes: `src/routes/sales.tsx`, `src/routes/inventory-hub.tsx`, `src/routes/customers.tsx`, `src/routes/admin.tsx`; each renders a shared `SectionHub` component (`src/components/pos/settings/SectionHub.tsx`) driven by `navGroups` from `nav-config.ts`, so the cards and the sidebar never drift apart. `nav-config.ts` gains a `hubTo` and per-item `blurb` field. Each route defines its own `head()` metadata.
- `SidebarNav.tsx`: group header becomes a `Link` to `hubTo` with a separate chevron button for expand/collapse.
- `supabase/schema13.sql` (run-once script for the POS database): allow `status = 'used'`, add `claimed_by_device text` and `claimed_at timestamptz`; update `terminal_token_heartbeat` to accept `active` and `used`; add `terminal_token_claim(p_token_id uuid, p_device text)` SECURITY DEFINER that atomically flips `active` → `used` and reports whether the caller won the claim.
- `src/lib/terminal-tokens.ts`: `redeemActivationCode` calls `terminal_token_claim` instead of the plain heartbeat and throws `ActivationError` when the claim is lost; add `deleteTerminalToken(id)`; `TokenStatus` widens to `"active" | "used" | "revoked"`; revocation checks treat `used` as healthy.
- `src/components/pos/TerminalTokens.tsx`: delete action + confirm dialog, new status badge, claimed-device column.