/**
 * The catalogue importer's thinking half.
 *
 * Everything here is plain data in, plain data out: read a spreadsheet's rows,
 * work out what each one means, decide which are new items and which top up an
 * existing one, and account for every single row that will not be saved.
 *
 * Nothing in this file touches the database, the screen or the network, so the
 * rules can be tested on their own and a large file can be worked through
 * without the till freezing.
 */
import type { Product } from "@/core/types/pos-types";
import { normaliseCode, productCodes } from "@/lib/product-lookup";

/** A row that passed every check and is ready to be saved. */
export type ImportRow = {
  /** 1-based line in the spreadsheet, counting the header, for messages. */
  line: number;
  barcode: string;
  name: string;
  price: number;
  cost: number;
  category: string;
  stock: number;
  customPoints: number;
  /** Matches something already in the catalogue — a restock, not a new item. */
  existing: boolean;
  /** Stable key for this row, so a resumed import recognises what it saved. */
  key: string;
};

/** A row that will not be saved, with the reason in plain words. */
export type RejectedRow = {
  line: number;
  barcode: string;
  name: string;
  reason: string;
};

export type ParsedImport = {
  /** Rows read from the file, including the bad ones. */
  total: number;
  rows: ImportRow[];
  skipped: RejectedRow[];
};

export const IMPORT_HEADERS = [
  "barcode",
  "name",
  "price",
  "cost",
  "category",
  "stock_quantity",
  "custom_points",
] as const;

/** Default rows per save. Small enough to stay responsive, large enough to be quick. */
export const DEFAULT_BATCH_SIZE = 200;

const headerKey = (h: string) => h.trim().toLowerCase().replace(/\s+/g, "_");

/** Numbers arrive as "RM 12.50", "1,200" or blank; read what is really there. */
export function readNumber(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** One spreadsheet row, indexed by tidy header name. */
function fieldReader(raw: Record<string, unknown>) {
  const map = new Map<string, unknown>();
  for (const [h, v] of Object.entries(raw)) map.set(headerKey(h), v);
  return (name: string) => map.get(name);
}

/**
 * Turn raw spreadsheet rows into a saveable plan.
 *
 * Duplicate codes inside the same file are reported rather than saved twice,
 * and a row that matches a catalogue item is marked as a restock.
 */
export function planImport(records: Record<string, unknown>[], catalogue: Product[]): ParsedImport {
  // One pass over the catalogue builds the lookup, instead of scanning the
  // whole catalogue once per row.
  const byCode = new Map<string, Product>();
  for (const p of catalogue) {
    for (const code of productCodes(p)) if (!byCode.has(code)) byCode.set(code, p);
  }

  const rows: ImportRow[] = [];
  const skipped: RejectedRow[] = [];
  const seen = new Map<string, number>();

  records.forEach((raw, index) => {
    const line = index + 2; // header is line 1
    const field = fieldReader(raw);
    const barcode = String(field("barcode") ?? field("sku") ?? "").trim();
    const name = String(field("name") ?? "").trim();

    if (!barcode && !name) return; // a blank trailing line is not an error
    if (!barcode) {
      skipped.push({ line, barcode, name, reason: "Missing barcode" });
      return;
    }
    if (!name) {
      skipped.push({ line, barcode, name, reason: "Missing product name" });
      return;
    }

    const code = normaliseCode(barcode);
    const firstSeen = seen.get(code);
    if (firstSeen !== undefined) {
      skipped.push({
        line,
        barcode,
        name,
        reason: `Duplicate barcode — the same code is already on line ${firstSeen}`,
      });
      return;
    }

    const price = readNumber(field("price"));
    if (price === null) {
      skipped.push({ line, barcode, name, reason: "Missing price" });
      return;
    }
    if (price < 0) {
      skipped.push({ line, barcode, name, reason: "Price cannot be negative" });
      return;
    }
    const cost = readNumber(field("cost"));
    if (cost !== null && cost < 0) {
      skipped.push({ line, barcode, name, reason: "Cost cannot be negative" });
      return;
    }
    const stock = readNumber(field("stock_quantity")) ?? 0;
    if (!Number.isFinite(stock)) {
      skipped.push({ line, barcode, name, reason: "Invalid stock quantity" });
      return;
    }

    seen.set(code, line);
    rows.push({
      line,
      barcode,
      name,
      price,
      cost: cost ?? Number((price * 0.6).toFixed(2)),
      category: String(field("category") ?? "").trim() || "Imported",
      stock: Math.round(stock),
      customPoints: readNumber(field("custom_points")) ?? 0,
      existing: byCode.has(code),
      key: code,
    });
  });

  return { total: records.length, rows, skipped };
}

/** Split the plan into save-sized groups. */
export function batches<T>(items: T[], size = DEFAULT_BATCH_SIZE): T[][] {
  const safe = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += safe) out.push(items.slice(i, i + safe));
  return out;
}

/** What happened to a whole import, row for row. */
export type ImportOutcome = {
  importId: string;
  fileName: string;
  startedAt: string;
  finishedAt?: string;
  total: number;
  created: number;
  restocked: number;
  skipped: RejectedRow[];
  failed: RejectedRow[];
  /** Rows never attempted — the run stopped or was interrupted. */
  pending: RejectedRow[];
};

/** Reads back as a sentence, for the summary card and the toast. */
export function describeOutcome(o: ImportOutcome): string {
  const done = o.created + o.restocked;
  const left = o.failed.length + o.pending.length;
  return left
    ? `${done} of ${o.total} rows saved · ${left} still to sort out`
    : `${done} of ${o.total} rows saved`;
}

/** Every rejected row as a spreadsheet-friendly table. */
export function outcomeReportRows(o: ImportOutcome): string[][] {
  const rows: string[][] = [["line", "barcode", "name", "status", "reason"]];
  for (const r of o.skipped) rows.push([String(r.line), r.barcode, r.name, "skipped", r.reason]);
  for (const r of o.failed) rows.push([String(r.line), r.barcode, r.name, "failed", r.reason]);
  for (const r of o.pending) rows.push([String(r.line), r.barcode, r.name, "pending", r.reason]);
  return rows;
}

/** How the store should run a batch import. */
export type ImportProductsOptions = {
  /** Rows per save. */
  batchSize?: number;
  /** Row keys a previous, interrupted run already stored. */
  alreadyDone?: string[];
  /** Ties the audit entries of one run together. */
  importId?: string;
  /** Stop after the first failed batch instead of carrying on. */
  stopOnBatchFailure?: boolean;
  onProgress?: (done: number, total: number) => void;
  onBatchSaved?: (keys: string[], totals: { created: number; restocked: number }) => void;
};

export type ImportProductsResult = {
  created: number;
  restocked: number;
  failed: RejectedRow[];
  pending: RejectedRow[];
  /** Row keys genuinely stored in this run. */
  savedKeys: string[];
};

/** Plain wording for why a batch would not save. */
export function importFailureReason(error: unknown): string {
  const message = String((error as { message?: string })?.message ?? error ?? "").trim();
  const lower = message.toLowerCase();
  if (!message) return "The database refused the batch without saying why";
  if (lower.includes("permission") || lower.includes("row-level security"))
    return "Not allowed to add products here";
  if (lower.includes("duplicate key") || lower.includes("unique"))
    return "A code in this batch is already used by another product";
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("offline"))
    return "Connection lost while saving this batch";
  if (lower.includes("violates") || lower.includes("constraint"))
    return `The database rejected this batch: ${message}`;
  return message;
}
