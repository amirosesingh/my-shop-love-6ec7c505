import { describe, expect, it } from "vitest";
import { functionShapes, checkFunction } from "../health-function-metadata";

describe("read-only health signatures", () => {
  const functions = functionShapes({ paths: { "/rpc/stock_transfer_approve": { post: {
    parameters: [{ in: "body", schema: { properties: { p_id: {}, p_note: {} }, required: ["p_id"] } }],
  } } } });
  it("allows omitted optional parameters without executing a transfer", () => {
    expect(checkFunction(functions, "stock_transfer_approve", ["p_id"]).ok).toBe(true);
  });
  it("reports missing functions and mismatched arguments instead of false success", () => {
    expect(checkFunction(functions, "voucher_redeem", []).ok).toBe(false);
    expect(checkFunction(functions, "stock_transfer_approve", ["wrong"]).ok).toBe(false);
    expect(checkFunction(functions, "stock_transfer_approve", []).ok).toBe(false);
  });
});
