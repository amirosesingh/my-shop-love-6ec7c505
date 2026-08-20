import { describe, expect, it } from "vitest";
import {
  describeDeleteBlock,
  isSalesHistoryBlock,
  usageBlock,
  PRODUCT_DELETE_UNVERIFIED,
  PRODUCT_HAS_SALES_HISTORY,
} from "../product-delete";

describe("product delete guard verdicts", () => {
  it("blocks a product with sales history and offers archiving", () => {
    const block = usageBlock({ sales: true });
    expect(block?.code).toBe(PRODUCT_HAS_SALES_HISTORY);
    expect(isSalesHistoryBlock(`${block?.code}: x`)).toBe(true);
  });

  it("blocks a product with purchase history", () => {
    expect(usageBlock({ purchases: true })).toEqual({
      code: "PRODUCT_IN_USE",
      reason: "it appears on purchase orders",
    });
  });

  it("reports sales first when several histories exist", () => {
    expect(usageBlock({ sales: true, purchases: true })?.code).toBe(PRODUCT_HAS_SALES_HISTORY);
  });

  it("allows a product with no history", () => {
    expect(usageBlock({})).toBeNull();
  });

  it("explains an unverifiable guard in plain words", () => {
    expect(describeDeleteBlock(`${PRODUCT_DELETE_UNVERIFIED}: whatever`)).toBe(
      "we could not confirm this product is safe to remove — try again",
    );
  });
});