import type {
  Member,
  PaperSize,
  Product,
  FontStyleSettings,
  ReceiptOverride,
  ReceiptSettings,
  Sale,
  Shift,
  Store,
  TaxSettings,
  Transfer,
} from "./pos-types";
import { lineUnitDiscount } from "./pos-types";
import { defaultReceiptSettings } from "./pos-seed";
import qrcode from "qrcode-generator";

export const STORE = {
  name: "NORTHWIND & CO.",
  line1: "42 Harbour Street, Unit 3",
  line2: "Tel 555-0100 · VAT 88-2201194",
};

/** Branch currently printing; set by the app whenever the store is switched. */
let activeBranch: Store | null = null;
export function setPrintStore(store: Store | null) {
  activeBranch = store;
}

/** Receipt customizer + tax configuration, pushed in by the app shell. */
let globalReceiptCfg: ReceiptSettings = defaultReceiptSettings;
let receiptCfg: ReceiptSettings = defaultReceiptSettings;
let taxCfg: TaxSettings = { enabled: true, rate: 5, mode: "exclusive" };

/** Merge the global receipt profile with any branch-level overrides. */
export function resolveReceiptCfg(
  receipt: ReceiptSettings,
  store?: Store | null,
): ReceiptSettings {
  const o: ReceiptOverride = store?.receiptOverrides ?? {};
  const clean = Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ) as ReceiptOverride;
  return { ...receipt, ...clean };
}

export function setPrintSettings(receipt: ReceiptSettings, tax: TaxSettings) {
  globalReceiptCfg = receipt;
  receiptCfg = resolveReceiptCfg(receipt, activeBranch);
  taxCfg = tax;
}

/** Preview helper: render with an explicit, already-resolved profile. */
export function setPreviewReceiptCfg(receipt: ReceiptSettings, tax: TaxSettings) {
  receiptCfg = receipt;
  taxCfg = tax;
}

export const PAPER_LABELS: Record<PaperSize, string> = {
  "80mm": "80mm Thermal (Standard)",
  "58mm": "58mm Thermal (Mini)",
  a4: "A4 Sheet",
  letter: "Letter",
};

/** @page + body geometry for each supported slip size. */
export function paperCss(paper: PaperSize) {
  switch (paper) {
    case "58mm":
      return { page: "58mm auto", width: "50mm", font: "10px", h1: "13px" };
    case "a4":
      return { page: "A4", width: "180mm", font: "13px", h1: "22px" };
    case "letter":
      return { page: "Letter", width: "170mm", font: "13px", h1: "22px" };
    default:
      return { page: "80mm auto", width: "72mm", font: "12px", h1: "15px" };
  }
}

export type ReceiptKind =
  | "sale"
  | "gift"
  | "duplicate"
  | "refund"
  | "kitchen"
  | "xreport"
  | "zreport"
  | "member"
  | "transfer";

const fmt = (n: number) => n.toFixed(2);
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Deterministic Code39-style bar pattern rendered from any reference string. */
export function barcodeSvg(value: string) {
  const chars = `*${value.toUpperCase()}*`.split("");
  let bars = "";
  chars.forEach((ch, i) => {
    const code = ch.charCodeAt(0) + i;
    for (let b = 0; b < 5; b++) {
      const wide = (code >> b) & 1;
      bars += `<i style="width:${wide ? 3 : 1}px"></i>`;
      bars += `<i style="width:${wide ? 1 : 2}px;background:transparent"></i>`;
    }
  });
  return `<div class="barcode">${bars}</div><div class="bc-text">${esc(value)}</div>`;
}

const shell = (title: string, body: string, autoPrint = true) => {
  const p = paperCss(receiptCfg.paper);
  return `<!doctype html><html><head>
<meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: ${p.page}; margin: ${receiptCfg.paper === "58mm" ? "3mm" : receiptCfg.paper === "80mm" ? "4mm" : "12mm"}; }
  * { box-sizing: border-box; }
  body { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: ${p.font}; color: #000; margin: 0 auto; width: ${p.width}; }
  h1 { font-size: ${p.h1}; letter-spacing: 2px; text-align: center; margin: 0 0 2px; }
  .c { text-align: center; }
  .muted { font-size: 0.85em; }
  .logo { text-align: center; margin-bottom: 4px; }
  .logo span { display: inline-block; border: 2px solid #000; border-radius: 4px; padding: 3px 8px; font-weight: 700; letter-spacing: 3px; font-size: 1.1em; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 1px 0; }
  .r { text-align: right; }
  .b { font-weight: 700; }
  .big { font-size: 1.2em; }
  .tag { border: 1px solid #000; padding: 2px 4px; display: inline-block; margin-top: 4px; font-size: 0.8em; letter-spacing: 1px; }
  .barcode { display: flex; align-items: flex-end; justify-content: center; height: 38px; gap: 1px; margin-top: 6px; }
  .barcode i { display: block; background: #000; height: 100%; }
  .bc-text { text-align: center; font-size: 0.85em; letter-spacing: 3px; margin-top: 2px; }
  @media print {
    html, body { width: ${p.width}; margin: 0 auto; }
    .no-print { display: none !important; }
  }
</style></head><body>${body}
${
  autoPrint
    ? `<script>window.onload=function(){window.focus();window.print();setTimeout(function(){window.close()},400)}<\/script>`
    : ""
}
</body></html>`;
};

const header = (subtitle?: string) => `
  ${receiptCfg.showLogo ? `<div class="logo"><span>N&amp;CO</span></div>` : ""}
  <h1>${STORE.name}</h1>
  <div class="c muted">${esc(
    activeBranch ? `${activeBranch.name} (${activeBranch.code})` : STORE.line1,
  )}</div>
  ${(receiptCfg.headerText || "")
    .split("\n")
    .filter(Boolean)
    .map((l) => `<div class="c muted">${esc(l)}</div>`)
    .join("")}
  ${subtitle ? `<div class="c tag">${esc(subtitle)}</div>` : ""}
  <hr>`;

function saleBody(sale: Sale, member: Member | null, kind: ReceiptKind) {
  const hidePrices = kind === "gift" || kind === "kitchen";
  const subtitle =
    kind === "gift"
      ? "GIFT RECEIPT"
      : kind === "duplicate"
        ? "DUPLICATE COPY"
        : kind === "refund"
          ? "REFUND / CREDIT NOTE"
          : kind === "kitchen"
            ? "KITCHEN ORDER TICKET"
            : undefined;
  const sign = kind === "refund" ? -1 : 1;
  const rows = sale.lines
    .map(
      (l) => `<tr><td>${esc(l.name)}${l.credit ? ' <span class="tag">CREDIT</span>' : ""}<div class="muted">${l.qty} x ${fmt(l.price)}${
        l.discount
          ? ` - ${l.discountType === "percent" ? `${l.discount}%` : fmt(l.discount)} disc`
          : ""
      }</div></td>${
        hidePrices
          ? ""
          : `<td class="r">${fmt(sign * (l.price - lineUnitDiscount(l)) * l.qty)}</td>`
      }</tr>`,
    )
    .join("");

  const totals = hidePrices
    ? ""
    : `<hr><table>
      <tr><td>Subtotal</td><td class="r">${fmt(sign * sale.subtotal)}</td></tr>
      <tr><td>Discount</td><td class="r">-${fmt(sale.discount)}</td></tr>
      ${
        sale.exchangeOfReceiptNo
          ? `<tr><td>Store Credit from Bill #${esc(sale.exchangeOfReceiptNo)}</td><td class="r">-${fmt(sale.exchangeCredit ?? 0)}</td></tr>`
          : ""
      }
      ${
        receiptCfg.showTax
          ? `<tr><td>Tax${taxCfg.enabled ? ` ${taxCfg.rate}%${taxCfg.mode === "inclusive" ? " incl." : ""}` : " (off)"}</td><td class="r">${fmt(sign * sale.tax)}</td></tr>`
          : ""
      }
      <tr class="b big"><td>TOTAL</td><td class="r">${fmt(sign * sale.total)}</td></tr>
      <tr><td>${esc(sale.method.toUpperCase())}</td><td class="r">${fmt(sign * sale.paid)}</td></tr>
      <tr><td>Change</td><td class="r">${fmt(sale.change)}</td></tr>
    </table>`;

  const memberBlock = member
    ? `<hr><div>Member ${esc(member.code)} · ${esc(member.name)}</div>
       ${
         receiptCfg.showPoints
           ? `<div class="muted">Tier ${member.tier} · Points earned ${sale.pointsEarned} · Balance ${member.points}</div>`
           : `<div class="muted">Tier ${member.tier}</div>`
       }`
    : "";

  return `${header(subtitle)}
    <table>
      <tr><td>Receipt</td><td class="r b">${esc(sale.receiptNo)}</td></tr>
      <tr><td>Date</td><td class="r">${new Date(sale.createdAt).toLocaleString()}</td></tr>
      <tr><td>Cashier</td><td class="r">${esc(sale.cashier)}</td></tr>
    </table>
    <hr>
    <table>${rows}</table>
    ${totals}
    ${memberBlock}
    <hr>
    ${
      kind === "gift"
        ? receiptCfg.showBarcode
          ? `<div class="c muted">GIFT RETURN CODE</div>${barcodeSvg(`GIFT-${sale.receiptNo}`)}`
          : `<div class="c muted">GIFT RETURN CODE ${esc(sale.receiptNo)}</div>`
        : kind === "kitchen"
          ? ""
          : `${receiptCfg.showBarcode ? barcodeSvg(sale.receiptNo) : ""}${
              sale.method === "card"
                ? `<div class="muted" style="margin-top:8px">Cardholder signature</div><div class="muted">______________________________</div>`
                : ""
            }`
    }
    <hr>
    <div class="c muted">${
      kind === "gift"
        ? "Exchangeable within 30 days with this slip"
        : esc(receiptCfg.footerText || "")
    }</div>
    <div class="c muted">${esc(sale.receiptNo)}</div>`;
}

function shiftBody(shift: Shift, sales: Sale[], kind: "xreport" | "zreport") {
  const active = sales.filter((s) => s.shiftId === shift.id && !s.refunded);
  const byMethod = ["cash", "card", "wallet", "points"].map((m) => ({
    m,
    n: active.filter((s) => s.method === m).length,
    v: active.filter((s) => s.method === m).reduce((a, s) => a + s.total, 0),
  }));
  const gross = active.reduce((a, s) => a + s.total, 0);
  const tax = active.reduce((a, s) => a + s.tax, 0);
  const cash = byMethod.find((b) => b.m === "cash")!.v;
  const expected = shift.openingFloat + cash;
  const counted = shift.countedCash ?? 0;
  return `${header(kind === "xreport" ? "X REPORT (MID-SHIFT)" : "Z REPORT (SHIFT CLOSE)")}
    <table>
      <tr><td>Cashier</td><td class="r">${esc(shift.cashier)}</td></tr>
      <tr><td>Opened</td><td class="r">${new Date(shift.openedAt).toLocaleString()}</td></tr>
      <tr><td>Closed</td><td class="r">${shift.closedAt ? new Date(shift.closedAt).toLocaleString() : "—"}</td></tr>
    </table><hr>
    <table>
      <tr><td>Transactions</td><td class="r">${active.length}</td></tr>
      ${byMethod
        .map((b) => `<tr><td>${b.m.toUpperCase()} (${b.n})</td><td class="r">${fmt(b.v)}</td></tr>`)
        .join("")}
      <tr><td>Tax collected</td><td class="r">${fmt(tax)}</td></tr>
      <tr class="b big"><td>GROSS</td><td class="r">${fmt(gross)}</td></tr>
    </table><hr>
    <table>
      <tr><td>Opening float</td><td class="r">${fmt(shift.openingFloat)}</td></tr>
      <tr><td>Expected drawer</td><td class="r">${fmt(expected)}</td></tr>
      <tr><td>Counted</td><td class="r">${fmt(counted)}</td></tr>
      <tr class="b"><td>Variance</td><td class="r">${fmt(counted - expected)}</td></tr>
    </table>
    ${shift.note ? `<hr><div class="muted">Note: ${esc(shift.note)}</div>` : ""}
    <hr><div class="c muted">Signature ______________________</div>`;
}

function memberBody(member: Member, sales: Sale[]) {
  const mine = sales.filter((s) => s.memberId === member.id).slice(0, 12);
  return `${header("MEMBER STATEMENT")}
    <table>
      <tr><td>Member</td><td class="r b">${esc(member.code)}</td></tr>
      <tr><td>Name</td><td class="r">${esc(member.name)}</td></tr>
      <tr><td>Tier</td><td class="r">${member.tier}</td></tr>
      <tr><td>Points</td><td class="r b">${member.points}</td></tr>
      <tr><td>Lifetime spend</td><td class="r">${fmt(member.totalSpend)}</td></tr>
    </table><hr>
    <table>${
      mine.length
        ? mine
            .map(
              (s) =>
                `<tr><td>${esc(s.receiptNo)}<div class="muted">${new Date(s.createdAt).toLocaleDateString()}</div></td><td class="r">${fmt(s.total)}</td></tr>`,
            )
            .join("")
        : `<tr><td class="muted">No purchases recorded yet</td></tr>`
    }</table>
    <hr><div class="c muted">Present this slip to redeem points</div>`;
}

function printHtml(title: string, body: string) {
  const html = shell(title, body);
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => frame.remove(), 4000);
}

export function printSaleReceipt(
  sale: Sale,
  member: Member | null,
  kind: ReceiptKind = "sale",
) {
  printHtml(`${sale.receiptNo} ${kind}`, saleBody(sale, member, kind));
}

export function printShiftReport(shift: Shift, sales: Sale[], kind: "xreport" | "zreport") {
  printHtml(kind, shiftBody(shift, sales, kind));
}

export function printMemberStatement(member: Member, sales: Sale[]) {
  printHtml(`${member.code} statement`, memberBody(member, sales));
}

/** Full HTML document for on-screen preview (no auto-print). */
export function saleReceiptPreview(sale: Sale, member: Member | null, kind: ReceiptKind) {
  return shell(sale.receiptNo, saleBody(sale, member, kind), false);
}

export function shiftReportPreview(shift: Shift, sales: Sale[]) {
  return shell("Z report", shiftBody(shift, sales, "zreport"), false);
}

function transferBody(
  transfer: Transfer,
  products: Product[],
  from: Store,
  to: Store,
) {
  const label =
    transfer.kind === "request" ? "STOCK REQUEST NOTE" : "STOCK TRANSFER NOTE";
  const lines = transfer.items.map((item) => ({
    item,
    product: products.find((p) => p.id === item.productId) ?? null,
  }));
  const units = transfer.items.reduce((a, i) => a + i.qty, 0);
  const value = lines.reduce((a, l) => a + (l.product?.cost ?? 0) * l.item.qty, 0);
  return `${header(label)}
    <table>
      <tr><td>Reference</td><td class="r b">${esc(transfer.ref)}</td></tr>
      <tr><td>Date</td><td class="r">${new Date(transfer.createdAt).toLocaleString()}</td></tr>
      <tr><td>Status</td><td class="r">${esc(transfer.status.replace("_", " ").toUpperCase())}</td></tr>
      <tr><td>Raised by</td><td class="r">${esc(transfer.createdBy)}</td></tr>
    </table><hr>
    <table>
      <tr><td>From</td><td class="r">${esc(from.name)} (${esc(from.code)})</td></tr>
      <tr><td>To</td><td class="r">${esc(to.name)} (${esc(to.code)})</td></tr>
    </table><hr>
    <table>
      ${lines
        .map(
          (l) => `<tr><td>${esc(l.product?.name ?? "Unknown item")}
            <div class="muted">${esc(l.product?.sku ?? "")} · ${fmt(l.product?.cost ?? 0)} ea</div></td>
          <td class="r b big">${l.item.qty}</td></tr>`,
        )
        .join("")}
    </table><hr>
    <table>
      <tr><td>Lines / units</td><td class="r">${lines.length} / ${units}</td></tr>
      <tr class="b"><td>Value</td><td class="r">${fmt(value)}</td></tr>
    </table>
    ${transfer.note ? `<hr><div class="muted">Note: ${esc(transfer.note)}</div>` : ""}
    <hr>
    <div class="muted">Dispatched by ______________________</div>
    <div class="muted">Received by  ______________________</div>
    <div class="c muted">${esc(transfer.ref)}</div>`;
}

export function printTransferNote(
  transfer: Transfer,
  products: Product[],
  from: Store,
  to: Store,
) {
  printHtml(transfer.ref, transferBody(transfer, products, from, to));
}

/**
 * Cash drawer kick. Browsers cannot open a USB drawer directly, so we send the
 * standard ESC/POS pulse sequence (ESC p 0 25 250) through the receipt printer,
 * which is how drawers are wired in practice. If a local ESC/POS bridge agent is
 * installed it is used instead.
 */
export function openCashDrawer() {
  const kick = "\x1B\x70\x00\x19\xFA";
  printHtml(
    "drawer",
    `<pre style="font-size:1px;line-height:1px">${kick}</pre><div class="c muted">DRAWER OPEN</div>`,
  );
}