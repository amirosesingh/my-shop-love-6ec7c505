import { describe, expect, it } from "vitest";

import { lineDiscountTotal, lineUnitDiscount } from "@/core/types/pos-types";
import { cartTotals } from "@/lib/pos-store";
import type { CartLine } from "@/core/types/pos-types";

const line = (patch: Partial<CartLine>): CartLine =>
  ({
    id: "l1",
    productId: "p1",
    name: "Item",
    price: 100,
    qty: 1,
    taxRate: 0,
    discount: 0,
    ...patch,
  }) as CartLine;

const noTax = { enabled: false, rate: 0, inclusive: false } as never;

describe("line discounts", () => {
  it("takes a coupon off first, then the percentage off what is left", () => {
    const l = line({ price: 100, qty: 1, discount: 10, discountType: "percent", couponDiscount: 20 });
    expect(lineUnitDiscount(l)).toBeCloseTo(28, 2);
    expect(lineDiscountTotal(l)).toBeCloseTo(28, 2);
  });

  it("never takes off more than the item is worth", () => {
    const l = line({ price: 50, qty: 2, discount: 999, discountType: "amount" });
    expect(lineDiscountTotal(l)).toBeCloseTo(100, 2);
  });
});

describe("cart totals", () => {
  it("keeps a promotion and a bill discount from cancelling each other out", () => {
    const totals = cartTotals([line({ price: 100 })], 10, "percent", noTax, 20);
    expect(totals.subtotal).toBeCloseTo(100, 2);
    expect(totals.billDiscount).toBeCloseTo(30, 2);
    expect(totals.total).toBeCloseTo(70, 2);
  });

  it("never lets a bill discount push the total below zero", () => {
    const totals = cartTotals([line({ price: 100 })], 500, "amount", noTax, 0);
    expect(totals.billDiscount).toBeCloseTo(100, 2);
    expect(totals.total).toBeCloseTo(0, 2);
  });

  it("ignores a negative promotion value", () => {
    const totals = cartTotals([line({ price: 100 })], 0, "amount", noTax, -50);
    expect(totals.total).toBeCloseTo(100, 2);
  });
});
