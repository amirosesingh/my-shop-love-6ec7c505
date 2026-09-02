import { describe, expect, it } from "vitest";
import { validateTenders, type Payment } from "@/core/types/pos-types";

const t = (p: Partial<Payment>): Payment => ({
  id: crypto.randomUUID(),
  method: "cash",
  amount: 0,
  ...p,
});

describe("validateTenders", () => {
  it("accepts a part-cash / part-card split that covers the bill", () => {
    const r = validateTenders(35, [
      t({ method: "cash", amount: 20 }),
      t({ method: "card", amount: 15, bankName: "HSBC terminal" }),
    ]);
    expect(r.error).toBeNull();
    expect(r.paid).toBe(35);
    expect(r.balance).toBe(0);
  });

  it("blocks a short payment and reports the shortfall", () => {
    const r = validateTenders(35, [t({ method: "cash", amount: 20 })]);
    expect(r.balance).toBe(15);
    expect(r.error).toBe("Short by 15.00");
  });

  it("allows cash overpay and returns the change", () => {
    const r = validateTenders(35, [
      t({ method: "card", amount: 15, bankName: "CIMB" }),
      t({ method: "cash", amount: 25 }),
    ]);
    expect(r.error).toBeNull();
    expect(r.change).toBe(5);
  });

  it("rejects a card tender with no bank / machine named", () => {
    const r = validateTenders(35, [
      t({ method: "cash", amount: 20 }),
      t({ method: "card", amount: 15 }),
    ]);
    expect(r.error).toMatch(/bank \/ card machine/i);
  });

  it("rejects zero-amount lines and non-cash overpay", () => {
    expect(validateTenders(35, [t({ method: "cash", amount: 0 })]).error).toMatch(/above zero/);
    expect(
      validateTenders(35, [t({ method: "wallet", amount: 40 })]).error,
    ).toMatch(/only cash/i);
  });
});