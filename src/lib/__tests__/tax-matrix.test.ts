/**
 * Money maths for the ticket: tax modes, discount spreading and exchange
 * credit. These numbers end up on a printed bill, so they are pinned here.
 */
import { describe, expect, it } from "vitest";

import { cartTotals } from "../pos-store";
import type { CartLine } from "@/core/types/pos-types";

const line = (over: Partial<CartLine> = {}): CartLine => ({
  productId: "p1",
  name: "Racket",
  price: 100,
  qty: 1,
  taxRate: 0,
  discount: 0,
  ...over,
});

describe("cartTotals — tax matrix", () => {
  it("adds tax on top when the shop prices exclusive", () => {
    const t = cartTotals([line({ price: 200, qty: 2 })], 0, "amount", {
      enabled: true,
      mode: "exclusive",
      rate: 10,
    } as never);
    expect(t.subtotal).toBe(400);
    expect(t.tax).toBe(40);
    expect(t.total).toBe(440);
  });

  it("pulls tax back out of the price when the shop prices inclusive", () => {
    const t = cartTotals([line({ price: 110 })], 0, "amount", {
      enabled: true,
      mode: "inclusive",
      rate: 10,
    } as never);
    expect(t.total).toBe(110);
    expect(t.tax).toBe(10);
  });

  it("charges nothing when tax is switched off", () => {
    const t = cartTotals([line({ price: 110, taxRate: 0.2 })], 0, "amount", {
      enabled: false,
      mode: "exclusive",
      rate: 10,
    } as never);
    expect(t.tax).toBe(0);
    expect(t.total).toBe(110);
  });

  it("taxes the discounted value, not the list price", () => {
    const t = cartTotals([line({ price: 100, qty: 1 })], 20, "amount", {
      enabled: true,
      mode: "exclusive",
      rate: 10,
    } as never);
    expect(t.discount).toBe(20);
    expect(t.net).toBe(80);
    expect(t.tax).toBe(8);
    expect(t.total).toBe(88);
  });

  it("reads a percent bill discount off the post-line-discount base", () => {
    const t = cartTotals([line({ price: 100, discount: 10 })], 50, "percent");
    expect(t.lineDiscount).toBe(10);
    expect(t.billDiscount).toBe(45);
    expect(t.net).toBe(45);
  });

  it("spreads a bill discount across per-line tax rates", () => {
    const lines = [line({ price: 100, taxRate: 0.1 }), line({ productId: "p2", price: 100, taxRate: 0 })];
    const t = cartTotals(lines, 50, "amount");
    // half the ticket is discounted away, so the taxed line only pays on 50
    expect(t.net).toBe(150);
    expect(t.tax).toBe(7.5);
    expect(t.total).toBe(157.5);
  });
});

describe("cartTotals — exchange and refund lines", () => {
  it("nets a returned item against the new sale", () => {
    const t = cartTotals([line({ price: 100 }), line({ productId: "old", price: 40, qty: -1, credit: true })], 0);
    expect(t.subtotal).toBe(60);
    expect(t.credit).toBe(40);
    expect(t.total).toBe(60);
  });

  it("reports a refund-only ticket as a negative total", () => {
    const t = cartTotals([line({ productId: "old", price: 40, qty: -1, credit: true })], 0);
    expect(t.total).toBe(-40);
    expect(t.credit).toBe(40);
  });

  it("keeps free-of-charge promo lines out of the money", () => {
    const t = cartTotals([line({ price: 100 }), line({ productId: "gift", price: 0, foc: true })], 0);
    expect(t.total).toBe(100);
  });
});
