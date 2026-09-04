/**
 * The ticket a manager is asked to approve.
 *
 * An approval request carries a picture of the exact ticket at the moment it
 * was sent: every line, the discounts already on it, the totals and the
 * member context that matters for the decision. The fingerprint below is
 * taken from the material parts of that picture, so the server can refuse an
 * approval whose ticket has since changed.
 *
 * The snapshot never carries anything about the customer beyond what the
 * decision needs — a name, the membership level and the points that are in
 * play. No address, no phone, no purchase history.
 */

export type SnapshotLine = {
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
  /** true when the price was typed at the till rather than taken from the catalogue */
  priceOverridden?: boolean;
};

export type SnapshotMember = {
  id: string;
  name: string;
  tier?: string;
  points?: number;
};

export type TicketSnapshot = {
  ticketId: string;
  capturedAt: string;
  storeId: string;
  terminalId: string;
  cashier: string;
  billNo?: string;
  lines: SnapshotLine[];
  subtotal: number;
  discount: number;
  tax: number;
  serviceCharge: number;
  total: number;
  /** what the cashier is asking for, and what the ticket would come to */
  requestedValue?: number;
  requestedLabel?: string;
  expectedTotal?: number;
  member?: SnapshotMember | null;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0;
};

const text = (v: unknown, max = 200): string => String(v ?? "").slice(0, max);

/** Coerce anything into a snapshot the approver can read and the server can compare. */
export function normalizeSnapshot(input: unknown): TicketSnapshot | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const rawLines = Array.isArray(row["lines"]) ? (row["lines"] as unknown[]) : [];
  const lines: SnapshotLine[] = rawLines.slice(0, 300).map((l) => {
    const line = (l ?? {}) as Record<string, unknown>;
    return {
      sku: text(line["sku"], 60),
      name: text(line["name"], 160),
      qty: num(line["qty"]),
      unitPrice: num(line["unitPrice"]),
      discount: num(line["discount"]),
      lineTotal: num(line["lineTotal"]),
      ...(line["priceOverridden"] === true ? { priceOverridden: true } : {}),
    };
  });
  const memberRow = (row["member"] ?? null) as Record<string, unknown> | null;
  return {
    ticketId: text(row["ticketId"], 80),
    capturedAt: text(row["capturedAt"], 40) || new Date().toISOString(),
    storeId: text(row["storeId"], 64),
    terminalId: text(row["terminalId"], 64),
    cashier: text(row["cashier"], 120),
    ...(row["billNo"] ? { billNo: text(row["billNo"], 40) } : {}),
    lines,
    subtotal: num(row["subtotal"]),
    discount: num(row["discount"]),
    tax: num(row["tax"]),
    serviceCharge: num(row["serviceCharge"]),
    total: num(row["total"]),
    ...(row["requestedValue"] === undefined || row["requestedValue"] === null
      ? {}
      : { requestedValue: num(row["requestedValue"]) }),
    ...(row["requestedLabel"] ? { requestedLabel: text(row["requestedLabel"], 120) } : {}),
    ...(row["expectedTotal"] === undefined || row["expectedTotal"] === null
      ? {}
      : { expectedTotal: num(row["expectedTotal"]) }),
    member: memberRow
      ? {
          id: text(memberRow["id"], 80),
          name: text(memberRow["name"], 160),
          ...(memberRow["tier"] ? { tier: text(memberRow["tier"], 60) } : {}),
          ...(memberRow["points"] === undefined || memberRow["points"] === null
            ? {}
            : { points: num(memberRow["points"]) }),
        }
      : null,
  };
}

/**
 * A stable fingerprint of everything that would make an old approval wrong:
 * the lines, their quantities and prices, the discounts, the totals, the
 * member and the value being asked for. Presentation-only fields (labels,
 * capture time, terminal) are deliberately left out.
 */
export function snapshotFingerprint(snapshot: TicketSnapshot | null | undefined): string {
  if (!snapshot) return "";
  const material = [
    snapshot.ticketId,
    ...snapshot.lines.map((l) =>
      [l.sku, l.name, l.qty, l.unitPrice, l.discount, l.lineTotal].join(":"),
    ),
    snapshot.subtotal,
    snapshot.discount,
    snapshot.tax,
    snapshot.serviceCharge,
    snapshot.total,
    snapshot.requestedValue ?? "",
    snapshot.member?.id ?? "",
  ].join("|");

  // FNV-1a, so the same string gives the same fingerprint in the browser, on
  // the server and on a terminal, with no crypto and nothing asynchronous.
  let h = 0x811c9dc5;
  for (let i = 0; i < material.length; i += 1) {
    h ^= material.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16).padStart(8, "0")}${material.length.toString(16)}`;
}

/** True when the ticket in hand is still the one that was approved. */
export const snapshotMatches = (snapshot: TicketSnapshot | null, hash: string): boolean =>
  !!hash && snapshotFingerprint(snapshot) === hash;
