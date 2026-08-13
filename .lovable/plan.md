# Branch-Scoped Settings + Racket Intake Overhaul

## What the audit found

- **Settings** live in one global row (`pos_settings`) exposed as `state.settings` via `usePos()`; `updateSettings()` writes the whole global blob. A partial per-branch idea already exists (`ReceiptOverride` used by the identity page, `branches` policy map in `integrations`), plus an unused Global to Cluster to Branch engine (`settings_scoped`, `settings-scope.*`, `/settings/inheritance`).
- **Branch context** is solid: `src/lib/active-branch.ts` (terminal-bound branch) and `usePos().currentStore`.
- **Racket intake** is not a separate drawer — it is the "Book & pay later / Racket booking" dialog inside `src/routes/index.tsx` (`racketMode`), with free-text fields for racket model, string type and tension, a plain customer name/phone pair and a single stringing-fee input.
- **Members**: the register already has live member search over `state.members` plus `QuickMemberDialog`; the booking dialog uses neither.
- **Products**: `ProductSearchDialog.tsx` exists for the cart; categories and subcategories come from `product_categories` (`catalog-meta.ts`) and `products.category` / `sub_category`.
- **Printing**: `printBookingSlip` and `printJobTag` already exist in `pos-print.ts` and both already fire on save.

## What you get

### 1. Global vs. store-wise settings matrix
- Every settings block gets a scope control: **Global default** or **Store override** for the branch in context, with a **Reset to global default** button that clears the local value.
- Super admins can mark a block **Locked globally** (branch managers see it read-only with a lock note) or **Configurable per store**. Tax and audit/review rules default to locked; labour fee, booking rules, category mappings and receipt header/footer default to per-store.
- One resolver used everywhere: store override, then global value, then shipped app default. Existing screens keep reading `state.settings` and silently get resolved values.

### 2. Member lookup in the racket / booking form
- A search box matching name, phone or member code; picking a member fills name, phone and shows tier and discount rate. Inline **Quick add member** when there is no match.
- New **Settings > Booking rules** toggle: *Require customer information for bookings*.
  - ON: name and phone are mandatory and Save stays disabled until a valid customer is chosen.
  - OFF: customer optional; the job gets an auto **Quick job tag** (`TAG-8042`) plus a staff/forwarder note field, and the bookings queue shows an **Assign customer** button to attach the member before pickup.

### 3. Racket inspection help
- A `?` badge beside "Racket information & inspection" opens a staff popover with tension guidelines (Beginner 20-22, Intermediate 23-25, Advanced 26-30+ lbs) and a pre-inspection checklist covering grommet wear, hairline frame cracks and high-tension risk.

### 4. Searchable pickers with manual fallback
- Racket model, string and grip each become searchable pickers over live stock, each ending with **Other / manual entry** that reveals custom name and custom price inputs.
- String origin switch: **Bought from store** (adds the SKU price and flags it for stock deduction) or **Customer provided own string** (0.00 with a description box).
- Live cost strip: locked base labour fee + string + grip/add-ons, with tax, total, deposit and balance due recalculating as you type.

### 5. Category and inventory mapping
- New **Settings > Category & inventory mapping** tab with searchable category to subcategory pickers for: re-stringing labour, store strings, grips and overgrips, other accessories. Saved intake line items carry the mapped category so sales and accounting reports group correctly.

### 6. Dual printing on save
- **Racket handle label**: tag ID, main/cross tension, string name, date.
- **Customer claim slip**: tag barcode, member info or "Walk-in / unassigned", itemised costs, deposit paid, balance due.

## Technical design

**Data** — one migration:
- `settings_overrides(scope, scope_id, section, patch jsonb, updated_by, timestamps, pk(scope, scope_id, section))` for section-level branch patches, plus `settings_locks(section pk, locked bool, updated_by, timestamps)`. Both with GRANTs, RLS (staff read / supervisor write) and security-definer RPCs mirroring the existing `settings_upsert` pattern.
- `bookings` gains `tag_id`, `intake_note`, `string_origin`, `string_source_product_id`, `grip_product_id` and a `charges jsonb` breakdown.

**Resolution**
- `src/lib/settings-resolve.ts`: pure deep merge of defaults, global and store patch, plus `isLocked(section)`.
- `src/lib/settings-scope.server.ts` and `.functions.ts` gain section read/write/clear/lock helpers reusing the existing service-role fallback.
- `src/lib/pos-store.tsx` applies the active branch patch after loading the global row, and `updateSettings()` routes writes to the branch patch when the section is in override mode (blocked client and server side when locked).

**UI**
- `src/components/pos/settings/ScopeBadge.tsx` (badge, override switch, lock, reset) wired into `SettingsFrame` so every settings page inherits it.
- New `src/routes/settings.booking-rules.tsx` and `src/routes/settings.category-mapping.tsx`, both added to the settings hub.
- Intake extracted from `src/routes/index.tsx` into `src/components/pos/booking/RacketIntakeForm.tsx` with `MemberLookupField.tsx`, `InventoryPicker.tsx` (search plus manual fallback) and `InspectionHelp.tsx`; the register dialog and `/bookings` both render it.
- `src/lib/booking-charges.ts` for the labour + string + grip + tax maths, shared by the form and the printed slip.
- `src/lib/pos-print.ts` gains `printRacketHandleLabel` and extends the claim slip with the tag barcode and cost breakdown.
- `/bookings` queue gains the **Assign customer** action for unassigned tag jobs.

**Version** — bumped via `scripts/bump-version.cjs` as the final step.