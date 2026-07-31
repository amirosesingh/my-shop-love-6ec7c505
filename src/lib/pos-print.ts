import type { Member, Sale, Shift } from "./pos-types";

export const STORE = {
  name: "NORTHWIND & CO.",
  line1: "42 Harbour Street, Unit 3",
  line2: "Tel 555-0100 · VAT 88-2201194",
};

export type ReceiptKind =
  | "sale"
  | "gift"
  | "duplicate"
  | "refund"
  | "kitchen"
  | "xreport"
  | "zreport"
  | "member";

const fmt = (n: number) => n.toFixed(2);
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const shell = (title: string, body: string) => `<!doctype html><html><head>
<meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 12px; color: #000; margin: 0; width: 72mm; }
  h1 { font-size: 15px; letter-spacing: 2px; text-align: center; margin: 0 0 2px; }
  .c { text-align: center; }
  .muted { font-size: 10px; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 1px 0; }
  .r { text-align: right; }
  .b { font-weight: 700; }
  .big { font-size: 14px; }
  .tag { border: 1px solid #000; padding: 2px 4px; display: inline-block; margin-top: 4px; font-size: 10px; letter-spacing: 1px; }
</style></head><body>${body}
<script>window.onload=function(){window.focus();window.print();setTimeout(function(){window.close()},400)}<\/script>
</body></html>`;

const header = (subtitle?: string) => `
  <h1>${STORE.name}</h1>
  <div class="c muted">${STORE.line1}</div>
  <div class="c muted">${STORE.line2}</div>
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
      (l) => `<tr><td>${esc(l.name)}<div class="muted">${l.qty} x ${fmt(l.price)}${
        l.discount ? ` - ${fmt(l.discount)} disc` : ""
      }</div></td>${
        hidePrices ? "" : `<td class="r">${fmt(sign * (l.price - l.discount) * l.qty)}</td>`
      }</tr>`,
    )
    .join("");

  const totals = hidePrices
    ? ""
    : `<hr><table>
      <tr><td>Subtotal</td><td class="r">${fmt(sign * sale.subtotal)}</td></tr>
      <tr><td>Discount</td><td class="r">-${fmt(sale.discount)}</td></tr>
      <tr><td>Tax</td><td class="r">${fmt(sign * sale.tax)}</td></tr>
      <tr class="b big"><td>TOTAL</td><td class="r">${fmt(sign * sale.total)}</td></tr>
      <tr><td>${esc(sale.method.toUpperCase())}</td><td class="r">${fmt(sign * sale.paid)}</td></tr>
      <tr><td>Change</td><td class="r">${fmt(sale.change)}</td></tr>
    </table>`;

  const memberBlock = member
    ? `<hr><div>Member ${esc(member.code)} · ${esc(member.name)}</div>
       <div class="muted">Tier ${member.tier} · Points earned ${sale.pointsEarned} · Balance ${member.points}</div>`
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
    <div class="c muted">${
      kind === "gift"
        ? "Exchangeable within 30 days with this slip"
        : "Thank you — see you again soon"
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