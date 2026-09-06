import { describe, expect, it } from "vitest";
import {
  batches,
  describeOutcome,
  importFailureReason,
  outcomeReportRows,
  planImport,
  readNumber,
} from "@/lib/product-import";
import type { Product } from "@/core/types/pos-types";

const product = (over: Partial<Product> = {}): Product => ({
  id: "p1",
  name: "Existing item",
  sku: "SKU1",
  barcode: "111",
  category: "Coffee",
  price: 10,
  cost: 5,
  stockByStore: { s1: 3 },
  reorderLevel: 10,
  taxRate: 0.05,
  ...over,
});

const row = (over: Record<string, unknown> = {}) => ({
  barcode: "222",
  name: "New item",
  price: "9.50",
  cost: "4",
  category: "Drinks",
  stock_quantity: "12",
  custom_points: "1",
  ...over,
});

describe("readNumber", () => {
  it("reads money-formatted values and leaves blanks empty", () => {
    expect(readNumber("RM 1,200.50")).toBe(1200.5);
    expect(readNumber("")).toBeNull();
    expect(readNumber(undefined)).toBeNull();
    expect(readNumber("abc")).toBeNull();
  });
});

describe("planImport", () => {
  it("accepts a good row and marks it as new", () => {
    const plan = planImport([row()], [product()]);
    expect(plan.skipped).toEqual([]);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]).toMatchObject({ barcode: "222", existing: false, stock: 12, line: 2 });
  });

  it("marks a row that matches the catalogue as a restock", () => {
    const plan = planImport([row({ barcode: "111" })], [product()]);
    expect(plan.rows[0].existing).toBe(true);
  });

  it("also matches on an alias barcode", () => {
    const plan = planImport([row({ barcode: "999" })], [product({ barcodes: ["999"] })]);
    expect(plan.rows[0].existing).toBe(true);
  });

  it("names a reason for every row it will not save", () => {
    const plan = planImport(
      [
        row({ barcode: "" }),
        row({ barcode: "333", name: "" }),
        row({ barcode: "444", price: "" }),
        row({ barcode: "555", price: "-2" }),
        row({ barcode: "666", cost: "-1" }),
      ],
      [],
    );
    expect(plan.rows).toHaveLength(0);
    expect(plan.skipped.map((s) => s.reason)).toEqual([
      "Missing barcode",
      "Missing product name",
      "Missing price",
      "Price cannot be negative",
      "Cost cannot be negative",
    ]);
  });

  it("keeps the first of two identical barcodes and explains the second", () => {
    const plan = planImport([row({ barcode: "777" }), row({ barcode: "777" })], []);
    expect(plan.rows).toHaveLength(1);
    expect(plan.skipped[0].reason).toContain("line 2");
  });

  it("ignores a completely blank trailing line", () => {
    const plan = planImport([row(), { barcode: "", name: "" }], []);
    expect(plan.rows).toHaveLength(1);
    expect(plan.skipped).toHaveLength(0);
  });

  it("accounts for every line of the file", () => {
    const records = Array.from({ length: 50 }, (_, i) => row({ barcode: `b${i}` }));
    records.push(row({ barcode: "", name: "no code" }));
    const plan = planImport(records, []);
    expect(plan.rows.length + plan.skipped.length).toBe(plan.total);
  });

  it("tolerates untidy headers", () => {
    const plan = planImport([{ " Barcode ": "888", Product: "x", NAME: "Tea", Price: 3 }], []);
    expect(plan.rows[0]).toMatchObject({ barcode: "888", name: "Tea", price: 3 });
  });

  it("falls back to a cost when the file has none", () => {
    const plan = planImport([row({ cost: "", price: "10" })], []);
    expect(plan.rows[0].cost).toBe(6);
  });
});

describe("batches", () => {
  it("splits into whole groups without dropping anything", () => {
    const groups = batches([1, 2, 3, 4, 5], 2);
    expect(groups).toEqual([[1, 2], [3, 4], [5]]);
    expect(groups.flat()).toHaveLength(5);
  });

  it("never produces a zero-sized group", () => {
    expect(batches([1, 2], 0)).toEqual([[1], [2]]);
  });
});

describe("importFailureReason", () => {
  it("turns database errors into something an operator can act on", () => {
    expect(importFailureReason(new Error("permission denied for table products"))).toBe(
      "Not allowed to add products here",
    );
    expect(importFailureReason(new Error("duplicate key value"))).toContain("already used");
    expect(importFailureReason(new Error("Failed to fetch"))).toContain("Connection lost");
    expect(importFailureReason(undefined)).toContain("without saying why");
  });
});

describe("outcome reporting", () => {
  const outcome = {
    importId: "abc",
    fileName: "f.xlsx",
    startedAt: "now",
    total: 10,
    created: 6,
    restocked: 2,
    skipped: [{ line: 3, barcode: "1", name: "a", reason: "Missing price" }],
    failed: [{ line: 4, barcode: "2", name: "b", reason: "Connection lost" }],
    pending: [],
  };

  it("says how many are still to sort out", () => {
    expect(describeOutcome(outcome)).toContain("1 still to sort out");
    expect(describeOutcome({ ...outcome, failed: [] })).toBe("8 of 10 rows saved");
  });

  it("lists every unsaved row in the report", () => {
    const rows = outcomeReportRows(outcome);
    expect(rows[0]).toEqual(["line", "barcode", "name", "status", "reason"]);
    expect(rows).toHaveLength(3);
  });
});
