/**
 * A failed-looking checkout must never lose a bill or mint a second one.
 */
import { describe, expect, it } from "vitest";
import { isDuplicateBillNumber } from "../pos-db";

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

describe("local write whitelist", () => {
  it("allows the sign-in log and drawer openings", async () => {
    const repo = await import("../../../electron/db/repo.cjs");
    const tables: string[] = repo.TABLES ?? [];
    expect(tables).toContain("shift_sessions");
    expect(tables).toContain("drawer_events");
  });
});
