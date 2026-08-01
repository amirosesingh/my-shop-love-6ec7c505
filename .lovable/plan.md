# Receipt branding & typography customizer

Extend the Settings screen so the printed receipt is fully brandable: company name, business details, font control per section, custom lines, and an optional QR code — with global defaults and per-branch overrides. Logo upload is out of scope for this round.

## What you'll be able to do

**Business identity**
- Company name (replaces the hard-coded "N&CO" badge / store title on every slip)
- Tax / VAT number, business registration number, phone, website
- Existing header and footer text stay, now grouped under the same panel

**Typography (full control, per section)**
For each of Header, Body and Footer:
- Font family: Monospace, Sans, Serif
- Font size
- Bold on/off
- Letter spacing

Paper size keeps driving the base geometry; these settings layer on top.

**Custom lines**
- Add / remove / reorder free-form lines (e.g. "Return policy: 7 days within receipt")
- Each line picks a placement: below header, or above footer

**QR code**
- Toggle on/off, set the target text or URL, choose size and placement (above or below footer)

**Global + per branch**
- A global default profile used by all stores
- Any branch can switch to "Custom for this branch" and override company name, header, footer, custom lines and QR; unset fields fall back to global
- Branch selector on the receipt panel to preview and edit each store's version

**Live preview** on the right updates instantly for every change, at the selected paper size.

## Technical outline

- `src/lib/pos-types.ts`: extend `ReceiptSettings` with `companyName`, `taxNumber`, `regNumber`, `phone`, `website`, `fonts: { header, body, footer }` (family / size / bold / letterSpacing), `customLines: { id, text, placement }[]`, `qr: { enabled, value, size, placement }`. Add `receiptOverrides?: Partial<ReceiptSettings>` to the `Store` type.
- `src/lib/pos-print.ts`: replace the hard-coded `N&CO` badge and `STORE.name` in `header()` with resolved values; emit CSS for the three font scopes and apply them to the header block, table body and footer; render business-info lines, custom lines by placement, and a QR block generated in-app (self-contained, same approach as the existing `barcodeSvg`). Add a `resolveReceiptCfg(store)` helper that merges global settings with the active branch override; `setPrintSettings` passes the active store through.
- `src/routes/settings.tsx`: reorganise the customizer into tabs — Identity, Typography, Extra lines, QR, Elements — plus a branch selector with an "Override for this branch" switch. Live preview keeps using `saleReceiptPreview`.
- Persistence: global settings live in `pos_settings`; a migration adds `company_name`, `tax_number`, `reg_number`, `phone`, `website`, `fonts` jsonb, `custom_lines` jsonb and `qr` jsonb with safe defaults, and the row mappers in `src/lib/pos-db.ts` are updated. Per-branch overrides ride along with the existing store list, which is currently kept client-side rather than in the database.
- Access stays gated behind the existing `can_access_pos_settings` permission.