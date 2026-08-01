import type { AuditLog } from "@/lib/audit-log";

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
const money = (v: unknown) =>
  `$${num(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const str = (v: unknown, fallback = "") =>
  typeof v === "string" && v.trim() ? v.trim() : fallback;

export const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** Turn a raw audit record into one plain-English sentence. */
export function describeLog(l: AuditLog): string {
  const d = l.details ?? {};
  const who = l.staffName || l.staffId || "Someone";
  const mod = (l.module || "the app").replace(/-/g, " ");

  switch (l.action) {
    case "Bill created":
      return `${who} completed a ${str(d["paymentMethod"], "cash")} sale of ${money(d["total"])} on Bill #${str(d["receiptNo"], "—")}`;
    case "Exchange bill created":
      return `${who} processed an exchange for Bill #${str(d["exchangeOfReceiptNo"], "—")} ➔ issued new Bill #${str(d["receiptNo"], "—")} (${money(d["total"])} net)`;
    case "Sale refunded":
      return `${who} refunded Bill #${str(d["receiptNo"], "—")}`;
    case "Shift opened":
      return `${who} opened a shift for ${str(d["cashier"], who)} with a ${money(d["openingFloat"])} opening float`;
    case "Shift closed":
      return `${who} closed the shift and counted ${money(d["countedCash"])} in the drawer`;
    case "Stock adjusted": {
      const delta = num(d["delta"]);
      const po = str(d["invoiceNo"]);
      return `${who} updated stock for "${str(d["name"], "item")}" (${delta >= 0 ? "+" : ""}${delta} units${po ? ` added via Receiving PO #${po}` : ""}) — now ${num(d["updatedStock"])} on hand`;
    }
    case "Product created":
      return `${who} created the product "${str(d["name"], "item")}"${str(d["barcode"]) ? ` (barcode ${str(d["barcode"])})` : ""}`;
    case "Product updated": {
      const prev = d["previous"] as Record<string, unknown> | null;
      const price = num(d["price"] ?? (d["updated"] as Record<string, unknown>)?.["price"]);
      return prev && num(prev["price"]) !== price && price
        ? `${who} changed the price of "${str(d["name"], "item")}" from ${money(prev["price"])} to ${money(price)}`
        : `${who} updated the product "${str(d["name"], "item")}"`;
    }
    case "Receiving line scanned":
      return `${who} scanned barcode ${str(d["barcode"], "—")} and matched "${str(d["name"], "item")}" on the receiving invoice`;
    case "Unknown barcode scanned":
      return `${who} scanned unknown barcode ${str(d["barcode"], "—")} and was prompted to create a new item`;
    case "Receiving order finalized":
      return `${who} finalized Receiving PO #${str(d["invoiceNo"], "—")}${str(d["supplier"]) ? ` from ${str(d["supplier"])}` : ""} — ${num(d["units"] ?? d["totalUnits"])} units received`;
    case "Member created":
      return `${who} added a new member "${str(d["name"], "customer")}"${str(d["phone"]) ? ` (${str(d["phone"])})` : ""}`;
    case "Member profile edited": {
      const delta = num(d["pointsDelta"]);
      return delta
        ? `${who} adjusted points for "${str(d["name"], "customer")}" by ${delta > 0 ? "+" : ""}${delta}`
        : `${who} edited the profile for "${str(d["name"], "customer")}"`;
    }
    case "Settings updated": {
      const keys = Object.keys((d["updated"] as Record<string, unknown>) ?? {});
      return `${who} updated settings${keys.length ? ` (${keys.join(", ")})` : ""}`;
    }
    case "Page view":
      return `${who} opened the ${mod} screen`;
    case "Tab switch":
      return `${who} switched to the "${str(d["label"], "tab")}" tab in ${mod}`;
    case "Button click":
      return `${who} clicked "${str(d["label"], "a button")}" in ${mod} at ${timeOf(l.at)}`;
    case "Modal opened":
      return `${who} opened the "${str(d["title"], "dialog")}" dialog in ${mod}`;
    case "Modal closed":
      return `${who} closed the "${str(d["title"], "dialog")}" dialog in ${mod}`;
    case "Search query":
      return `${who} searched for "${str(d["query"])}" in ${mod}`;
    case "Exported audit logs":
      return `${who} exported ${num(d["rows"])} audit rows to CSV`;
    default:
      return `${who} — ${l.action.toLowerCase()} in ${mod}`;
  }
}
