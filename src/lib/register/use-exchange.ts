/**
 * Exchanges and refunds.
 *
 * Looks an old bill up by receipt number, lets the cashier pick the items
 * coming back, and drops them on the ticket as negative "credit" lines.
 * Lifted out of the register screen unchanged — the shift gate and the credit
 * maths behave exactly as before.
 */
import { useState } from "react";
import { toast } from "sonner";
import { lineUnitDiscount, r2 } from "@/core/types/pos-types";
import type { CartLine, DiscountType, Sale } from "@/core/types/pos-types";

type ExchangeDeps = {
  /** Past sales searched by receipt number. */
  sales: Sale[];
  /** No open shift = no exchange. */
  hasShift: () => boolean;
  setLines: (fn: (ls: CartLine[]) => CartLine[]) => void;
  setExchangeRef: (ref: string | null) => void;
};

export function useExchange(deps: ExchangeDeps) {
  const { sales, hasShift, setLines, setExchangeRef } = deps;

  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [billQuery, setBillQuery] = useState("");
  const [billHit, setBillHit] = useState<Sale | null>(null);
  /** Line index on the found bill → quantity coming back. */
  const [picks, setPicks] = useState<Record<number, number>>({});

  function lookupBill() {
    const ref = billQuery.trim().toLowerCase();
    const hit =
      sales.find((s) => s.receiptNo.toLowerCase() === ref) ??
      sales.find((s) => s.receiptNo.toLowerCase().includes(ref) && !!ref) ??
      null;
    setBillHit(hit);
    setPicks({});
    if (!hit) toast.error(`No bill found for “${billQuery}”`);
  }

  function addExchangeCredits() {
    if (!billHit) return;
    if (!hasShift()) {
      toast.error("Open a shift before processing an exchange");
      return;
    }
    const credits: CartLine[] = Object.entries(picks)
      .filter(([, qty]) => qty > 0)
      .map(([idx, qty]) => {
        const src = billHit.lines[Number(idx)]!;
        return {
          productId: src.productId,
          name: src.name,
          price: r2(src.price - lineUnitDiscount(src)),
          qty: -qty,
          taxRate: src.taxRate,
          discount: 0,
          discountType: "amount" as DiscountType,
          credit: true,
        };
      });
    if (!credits.length) {
      toast.error("Select at least one item to exchange");
      return;
    }
    setLines((ls) => [...credits, ...ls]);
    setExchangeRef(billHit.receiptNo);
    setExchangeOpen(false);
    setBillQuery("");
    setBillHit(null);
    setPicks({});
    toast.success(`Credits from ${billHit.receiptNo} added to the ticket`);
  }

  return {
    exchangeOpen,
    setExchangeOpen,
    billQuery,
    setBillQuery,
    billHit,
    setBillHit,
    picks,
    setPicks,
    lookupBill,
    addExchangeCredits,
  };
}
