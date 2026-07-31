import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { seedState } from "./pos-seed";
import type { CartLine, Member, PosState, Product, Sale, Shift } from "./pos-types";

const KEY = "pos-state-v1";

type Ctx = {
  ready: boolean;
  state: PosState;
  openShift: (cashier: string, openingFloat: number) => void;
  closeShift: (countedCash: number, note: string) => Shift | null;
  activeShift: Shift | null;
  recordSale: (sale: Omit<Sale, "id" | "receiptNo" | "createdAt">) => Sale;
  refundSale: (saleId: string) => void;
  upsertProduct: (product: Product) => void;
  removeProduct: (id: string) => void;
  adjustStock: (id: string, delta: number) => void;
  upsertMember: (member: Member) => void;
  removeMember: (id: string) => void;
  reset: () => void;
};

const PosContext = createContext<Ctx | null>(null);

export function PosProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PosState>(seedState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setState({ ...seedState, ...(JSON.parse(raw) as PosState) });
    } catch {
      /* ignore corrupt storage */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full */
    }
  }, [state, ready]);

  const activeShift = useMemo(
    () => state.shifts.find((s) => !s.closedAt) ?? null,
    [state.shifts],
  );

  const openShift = useCallback((cashier: string, openingFloat: number) => {
    setState((s) => ({
      ...s,
      shifts: [
        {
          id: crypto.randomUUID(),
          cashier,
          openedAt: new Date().toISOString(),
          closedAt: null,
          openingFloat,
          countedCash: null,
          note: "",
        },
        ...s.shifts,
      ],
    }));
  }, []);

  const closeShift = useCallback(
    (countedCash: number, note: string) => {
      if (!activeShift) return null;
      const closed: Shift = {
        ...activeShift,
        closedAt: new Date().toISOString(),
        countedCash,
        note,
      };
      setState((s) => ({
        ...s,
        shifts: s.shifts.map((x) => (x.id === closed.id ? closed : x)),
      }));
      return closed;
    },
    [activeShift],
  );

  const recordSale = useCallback((input: Omit<Sale, "id" | "receiptNo" | "createdAt">) => {
    const sale: Sale = {
      ...input,
      id: crypto.randomUUID(),
      receiptNo: "",
      createdAt: new Date().toISOString(),
    };
    setState((s) => {
      const counter = s.counter + 1;
      sale.receiptNo = `R-${String(counter).padStart(6, "0")}`;
      const products = s.products.map((p) => {
        const line = input.lines.find((l) => l.productId === p.id);
        return line ? { ...p, stock: p.stock - line.qty } : p;
      });
      const members = s.members.map((m) =>
        m.id === input.memberId
          ? {
              ...m,
              points: m.points + input.pointsEarned - (input.method === "points" ? input.paid : 0),
              totalSpend: Number((m.totalSpend + input.total).toFixed(2)),
            }
          : m,
      );
      return { ...s, counter, products, members, sales: [sale, ...s.sales] };
    });
    return sale;
  }, []);

  const refundSale = useCallback((saleId: string) => {
    setState((s) => {
      const sale = s.sales.find((x) => x.id === saleId);
      if (!sale || sale.refunded) return s;
      const products = s.products.map((p) => {
        const line = sale.lines.find((l) => l.productId === p.id);
        return line ? { ...p, stock: p.stock + line.qty } : p;
      });
      return {
        ...s,
        products,
        sales: s.sales.map((x) => (x.id === saleId ? { ...x, refunded: true } : x)),
      };
    });
  }, []);

  const upsertProduct = useCallback((product: Product) => {
    setState((s) => ({
      ...s,
      products: s.products.some((p) => p.id === product.id)
        ? s.products.map((p) => (p.id === product.id ? product : p))
        : [product, ...s.products],
    }));
  }, []);

  const removeProduct = useCallback((id: string) => {
    setState((s) => ({ ...s, products: s.products.filter((p) => p.id !== id) }));
  }, []);

  const adjustStock = useCallback((id: string, delta: number) => {
    setState((s) => ({
      ...s,
      products: s.products.map((p) => (p.id === id ? { ...p, stock: p.stock + delta } : p)),
    }));
  }, []);

  const upsertMember = useCallback((member: Member) => {
    setState((s) => ({
      ...s,
      members: s.members.some((m) => m.id === member.id)
        ? s.members.map((m) => (m.id === member.id ? member : m))
        : [member, ...s.members],
    }));
  }, []);

  const removeMember = useCallback((id: string) => {
    setState((s) => ({ ...s, members: s.members.filter((m) => m.id !== id) }));
  }, []);

  const reset = useCallback(() => setState(seedState), []);

  const value: Ctx = {
    ready,
    state,
    activeShift,
    openShift,
    closeShift,
    recordSale,
    refundSale,
    upsertProduct,
    removeProduct,
    adjustStock,
    upsertMember,
    removeMember,
    reset,
  };

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePos() {
  const ctx = useContext(PosContext);
  if (!ctx) throw new Error("usePos must be used inside PosProvider");
  return ctx;
}

export const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number.isFinite(n) ? n : 0,
  );

export function cartTotals(lines: CartLine[], cartDiscount: number) {
  const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0);
  const lineDiscount = lines.reduce((a, l) => a + l.discount * l.qty, 0);
  const taxable = lines.reduce((a, l) => a + (l.price - l.discount) * l.qty * l.taxRate, 0);
  const discount = lineDiscount + cartDiscount;
  const tax = Number(taxable.toFixed(2));
  const total = Number(Math.max(0, subtotal - discount + tax).toFixed(2));
  return { subtotal: Number(subtotal.toFixed(2)), discount: Number(discount.toFixed(2)), tax, total };
}