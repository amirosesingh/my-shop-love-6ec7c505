/**
 * A failed-looking checkout must never lose a bill or mint a second one.
 */
import { describe, expect, it } from "vitest";
import { isDuplicateBillNumber, stableChildId } from "@/core/api/pos-db";

describe("duplicate bill detection", () => {
  it("recognises a unique-key refusal on the bill number", () => {
    expect(
      isDuplicateBillNumber({
        code: "23505",
        message: 'duplicate key value violates unique constraint "sales_bill_number_key"',
      }),
    ).toBe(true);
    expect(
      isDuplicateBillNumber(
        new Error("Violation of UNIQUE KEY constraint 'UX_sales_bill_number' on table 'sales'"),
      ),
    ).toBe(true);
  });

  it("leaves other failures alone so they still surface", () => {
    expect(isDuplicateBillNumber(new Error("Failed to fetch"))).toBe(false);
    expect(isDuplicateBillNumber(new Error("permission denied for table sales"))).toBe(false);
    expect(isDuplicateBillNumber(null)).toBe(false);
  });
});

describe("checkout row identity", () => {
  it("derives stable, distinct UUIDs for child rows", () => {
    const parent = "12345678-1234-4234-a234-123456789abc";
    expect(stableChildId(parent, "2", 0)).toBe(stableChildId(parent, "2", 0));
    expect(stableChildId(parent, "2", 0)).not.toBe(stableChildId(parent, "2", 1));
    expect(stableChildId(parent, "1", 0)).not.toBe(stableChildId(parent, "2", 0));
    expect(stableChildId(parent, "2", 0)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("local write whitelist", () => {
  it("allows the sign-in log and drawer openings", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("electron/db/repo.cjs", "utf8");
    const list = source.slice(source.indexOf("const TABLES = ["), source.indexOf("];"));
    expect(list).toContain('"shift_sessions"');
    expect(list).toContain('"drawer_events"');
  });
});
