import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { defaultSettings, seedState } from "./pos-seed";
import type {
  AppSettings,
  Booking,
  BookingPayment,
  CartLine,
  Member,
  PaymentMethod,
  PosState,
  Product,
  Promotion,
  Sale,
  Shift,
  Store,
  TaxSettings,
  Transfer,
  TransferKind,
} from "./pos-types";
import { bookingBalance, lineUnitDiscount, r2, type DiscountType } from "./pos-types";
import { logger } from "./audit-log";
import { db, dbError, loadCloudState } from "./pos-db";

const KEY = "pos-state-v2";

export const stockAt = (product: Product, storeId: string) =>
  product.stockByStore?.[storeId] ?? 0;

/** Units held back at a store by still-open bookings. */
export const reservedAt = (bookings: Booking[], productId: string, storeId: string) =>
  bookings
    .filter((b) => b.status === "active" && b.storeId === storeId)
    .reduce(
      (a, b) => a + b.lines.filter((l) => l.productId === productId && !l.credit).reduce((x, l) => x + l.qty, 0),
      0,
    );

/** Stock a cashier may actually sell right now: on hand minus booked units. */
export const availableAt = (
  product: Product,
  storeId: string,
  bookings: Booking[] = [],
) => stockAt(product, storeId) - reservedAt(bookings, product.id, storeId);

const bump = (p: Product, storeId: string, delta: number): Product => ({
  ...p,
  stockByStore: { ...p.stockByStore, [storeId]: stockAt(p, storeId) + delta },
});

type NewTransfer = {
  kind: TransferKind;
  fromStoreId: string;
  toStoreId: string;
  items: { productId: string; qty: number }[];
  note: string;
  createdBy: string;
};

export type NewBooking = {
  storeId: string;
  shiftId: string;
  lines: CartLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  /** deposit collected at the counter right now */
  deposit: number;
  depositMethod: PaymentMethod;
  dueDate: string;
  memberId: string | null;
  customerName: string;
  customerPhone: string;
  note: string;
  cashier: string;
};

/** Apply a stock delta for every line of a transfer at one store. */
const bumpItems = (
  products: Product[],
  items: { productId: string; qty: number }[],
  storeId: string,
  sign: 1 | -1,
) =>
  products.map((p) => {
    const item = items.find((i) => i.productId === p.id);
    return item ? bump(p, storeId, sign * item.qty) : p;
  });

type Ctx = {
  ready: boolean;
  state: PosState;
  stores: Store[];
  currentStore: Store;
  setCurrentStore: (id: string) => void;
  upsertStore: (store: Store) => void;
  removeStore: (id: string) => void;
  openShift: (cashier: string, openingFloat: number) => void;
  closeShift: (countedCash: number, note: string) => Shift | null;
  activeShift: Shift | null;
  recordSale: (sale: Omit<Sale, "id" | "receiptNo" | "createdAt">) => Sale;
  refundSale: (saleId: string) => void;
  createBooking: (input: NewBooking) => Booking;
  addBookingPayment: (id: string, amount: number, method: PaymentMethod, cashier: string) => Booking | null;
  collectBooking: (id: string, amount: number, method: PaymentMethod) => { booking: Booking; sale: Sale } | null;
  cancelBooking: (id: string, reason: string) => void;
  upsertProduct: (product: Product) => void;
  removeProduct: (id: string) => void;
  adjustStock: (id: string, delta: number, storeId?: string) => void;
  upsertMember: (member: Member) => void;
  removeMember: (id: string) => void;
  upsertPromotion: (promotion: Promotion) => void;
  removePromotion: (id: string) => void;
  togglePromotion: (id: string, active: boolean) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  createTransfer: (input: NewTransfer) => Transfer;
  approveTransfer: (id: string) => void;
  receiveTransfer: (id: string) => void;
  rejectTransfer: (id: string) => void;
  reset: () => void;
};

const PosContext = createContext<Ctx | null>(null);

export function PosProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PosState>(seedState);
  const [ready, setReady] = useState(false);
  // Latest snapshot for audit logging without re-creating every callback.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let cancelled = false;
    // Local-only slices (stores, shifts, transfers, counters) stay on the
    // terminal; catalogue, members, bills, promos and settings come from cloud.
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as PosState;
        // Migrate single-product transfers saved before multi-item support.
        const transfers = (saved.transfers ?? []).map((t) => {
          const legacy = t as Transfer & { productId?: string; qty?: number };
          return t.items
            ? t
            : { ...t, items: [{ productId: legacy.productId ?? "", qty: legacy.qty ?? 0 }] };
        });
        setState((s) => ({
          ...s,
          stores: saved.stores?.length ? saved.stores : s.stores,
          currentStoreId: saved.currentStoreId ?? s.currentStoreId,
          shifts: saved.shifts ?? [],
          transfers,
          bookings: saved.bookings ?? [],
          counter: saved.counter ?? 0,
          transferCounter: saved.transferCounter ?? 0,
          bookingCounter: saved.bookingCounter ?? 0,
        }));
      }
    } catch {
      /* ignore corrupt storage */
    }

    void (async () => {
      try {
        const cloud = await loadCloudState();
        if (cancelled) return;
        setState((s) => ({
          ...s,
          products: cloud.products,
          members: cloud.members,
          sales: cloud.sales,
          promotions: cloud.promotions.length ? cloud.promotions : s.promotions,
          settings: {
            tax: { ...defaultSettings.tax, ...cloud.settings.tax },
            receipt: { ...defaultSettings.receipt, ...cloud.settings.receipt },
            payment: { ...defaultSettings.payment, ...cloud.settings.payment },
          },
          // Keep the bill counter ahead of every receipt already in the cloud.
          counter: cloud.sales.reduce(
            (max, sale) => Math.max(max, Number(sale.receiptNo.split("-").pop()) || 0),
            s.counter,
          ),
        }));
      } catch (e) {
        dbError("Loading data", e);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full */
    }
  }, [state, ready]);

  const currentStore = useMemo(
    () => state.stores.find((s) => s.id === state.currentStoreId) ?? state.stores[0],
    [state.stores, state.currentStoreId],
  );

  const activeShift = useMemo(
    () => state.shifts.find((s) => !s.closedAt && s.storeId === currentStore.id) ?? null,
    [state.shifts, currentStore.id],
  );

  const setCurrentStore = useCallback(
    (id: string) => setState((s) => ({ ...s, currentStoreId: id })),
    [],
  );

  const upsertStore = useCallback((store: Store) => {
    setState((s) => ({
      ...s,
      stores: s.stores.some((x) => x.id === store.id)
        ? s.stores.map((x) => (x.id === store.id ? store : x))
        : [...s.stores, store],
      products: s.products.map((p) =>
        p.stockByStore[store.id] === undefined
          ? { ...p, stockByStore: { ...p.stockByStore, [store.id]: 0 } }
          : p,
      ),
    }));
  }, []);

  const removeStore = useCallback((id: string) => {
    setState((s) => {
      if (s.stores.length <= 1) return s;
      const stores = s.stores.filter((x) => x.id !== id);
      return {
        ...s,
        stores,
        currentStoreId: s.currentStoreId === id ? stores[0].id : s.currentStoreId,
      };
    });
  }, []);

  const openShift = useCallback(
    (cashier: string, openingFloat: number) => {
      logger.log("sale_event", "Shift opened", "shifts", {
        cashier,
        openingFloat,
        storeId: stateRef.current.currentStoreId,
      });
      setState((s) => ({
        ...s,
        shifts: [
          {
            id: crypto.randomUUID(),
            storeId: s.currentStoreId,
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
    },
    [],
  );

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
      logger.log("sale_event", "Shift closed", "shifts", {
        shiftId: closed.id,
        storeId: closed.storeId,
        openingFloat: closed.openingFloat,
        countedCash: countedCash,
        note,
      });
      return closed;
    },
    [activeShift],
  );

  const recordSale = useCallback((input: Omit<Sale, "id" | "receiptNo" | "createdAt">) => {
    const snapshot = stateRef.current;
    const counter = snapshot.counter + 1;
    const store = snapshot.stores.find((x) => x.id === input.storeId);
    const sale: Sale = {
      ...input,
      id: crypto.randomUUID(),
      receiptNo: `${store?.code ?? "R"}-${String(counter).padStart(6, "0")}`,
      createdAt: new Date().toISOString(),
    };

    const touchedProducts = snapshot.products
      .filter((p) => input.lines.some((l) => l.productId === p.id))
      .map((p) => {
        const line = input.lines.find((l) => l.productId === p.id)!;
        return bump(p, input.storeId, -line.qty);
      });
    const member = snapshot.members.find((m) => m.id === input.memberId) ?? null;
    const updatedMember = member
      ? {
          ...member,
          points:
            member.points + input.pointsEarned - (input.method === "points" ? input.paid : 0),
          totalSpend: Number((member.totalSpend + input.total).toFixed(2)),
        }
      : null;
    void db.recordSale(sale, touchedProducts, updatedMember);

    setState((s) => {
      const products = s.products.map((p) => {
        const line = input.lines.find((l) => l.productId === p.id);
        return line ? bump(p, input.storeId, -line.qty) : p;
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
      const tagged = input.exchangeOfReceiptNo
        ? s.sales.map((x) =>
            x.receiptNo === input.exchangeOfReceiptNo
              ? { ...x, exchangedToReceiptNo: sale.receiptNo }
              : x,
          )
        : s.sales;
      return { ...s, counter: Math.max(counter, s.counter + 1), products, members, sales: [sale, ...tagged] };
    });
    logger.log(
      "sale_event",
      sale.exchangeOfReceiptNo ? "Exchange bill created" : "Bill created",
      "register",
      {
        receiptNo: sale.receiptNo,
        storeId: sale.storeId,
        paymentMethod: sale.method,
        subtotal: sale.subtotal,
        discount: sale.discount,
        tax: sale.tax,
        total: sale.total,
        paid: sale.paid,
        memberId: sale.memberId ?? null,
        pointsEarned: sale.pointsEarned,
        exchangeOfReceiptNo: sale.exchangeOfReceiptNo ?? null,
        cart: sale.lines.map((l) => ({
          productId: l.productId,
          name: l.name,
          qty: l.qty,
          price: l.price,
          discount: l.discount,
          discountType: l.discountType,
          credit: !!l.credit,
        })),
      },
    );
    return sale;
  }, []);

  const createBooking = useCallback((input: NewBooking) => {
    const snapshot = stateRef.current;
    const counter = snapshot.bookingCounter + 1;
    const store = snapshot.stores.find((x) => x.id === input.storeId);
    const now = new Date().toISOString();
    const payments: BookingPayment[] = input.deposit
      ? [
          {
            id: crypto.randomUUID(),
            amount: r2(input.deposit),
            method: input.depositMethod,
            at: now,
            cashier: input.cashier,
          },
        ]
      : [];
    const booking: Booking = {
      id: crypto.randomUUID(),
      ref: `BK-${store?.code ?? "R"}-${String(counter).padStart(5, "0")}`,
      storeId: input.storeId,
      shiftId: input.shiftId,
      lines: input.lines,
      subtotal: input.subtotal,
      discount: input.discount,
      tax: input.tax,
      total: input.total,
      paid: r2(input.deposit),
      payments,
      dueDate: input.dueDate,
      memberId: input.memberId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      note: input.note,
      cashier: input.cashier,
      createdAt: now,
      status: "active",
    };
    setState((s) => ({
      ...s,
      bookingCounter: Math.max(counter, s.bookingCounter + 1),
      bookings: [booking, ...s.bookings],
    }));
    logger.log("sale_event", "Booking created", "bookings", {
      ref: booking.ref,
      storeId: booking.storeId,
      total: booking.total,
      deposit: booking.paid,
      balance: bookingBalance(booking),
      dueDate: booking.dueDate,
      customer: booking.customerName,
      items: booking.lines.map((l) => ({ name: l.name, qty: l.qty })),
    });
    return booking;
  }, []);

  const addBookingPayment = useCallback(
    (id: string, amount: number, method: PaymentMethod, cashier: string) => {
      const current = stateRef.current.bookings.find((b) => b.id === id);
      if (!current || current.status !== "active" || amount <= 0) return null;
      const payment: BookingPayment = {
        id: crypto.randomUUID(),
        amount: r2(amount),
        method,
        at: new Date().toISOString(),
        cashier,
      };
      const updated: Booking = {
        ...current,
        paid: r2(current.paid + payment.amount),
        payments: [...current.payments, payment],
      };
      setState((s) => ({
        ...s,
        bookings: s.bookings.map((b) => (b.id === id ? updated : b)),
      }));
      logger.log("sale_event", "Booking part payment", "bookings", {
        ref: updated.ref,
        amount: payment.amount,
        method,
        paid: updated.paid,
        balance: bookingBalance(updated),
      });
      return updated;
    },
    [],
  );

  const cancelBooking = useCallback((id: string, reason: string) => {
    const current = stateRef.current.bookings.find((b) => b.id === id);
    if (!current || current.status !== "active") return;
    setState((s) => ({
      ...s,
      bookings: s.bookings.map((b) =>
        b.id === id
          ? {
              ...b,
              status: "cancelled",
              closedAt: new Date().toISOString(),
              note: reason ? `${b.note ? `${b.note} · ` : ""}Cancelled: ${reason}` : b.note,
            }
          : b,
      ),
    }));
    logger.log("sale_event", "Booking cancelled", "bookings", {
      ref: current.ref,
      reason,
      refundable: current.paid,
    });
  }, []);

  const collectBooking = useCallback(
    (id: string, amount: number, method: PaymentMethod) => {
      const current = stateRef.current.bookings.find((b) => b.id === id);
      if (!current || current.status !== "active") return null;
      const balance = bookingBalance(current);
      const settled = r2(Math.min(Math.max(amount, 0), balance));
      const sale = recordSale({
        storeId: current.storeId,
        shiftId: activeShift?.id ?? current.shiftId,
        lines: current.lines,
        subtotal: current.subtotal,
        discount: current.discount,
        tax: current.tax,
        total: current.total,
        paid: current.total,
        change: r2(Math.max(0, amount - balance)),
        method,
        memberId: current.memberId,
        pointsEarned: 0,
        cashier: current.cashier,
        bookingRef: current.ref,
      });
      const finalPayment: BookingPayment = {
        id: crypto.randomUUID(),
        amount: settled,
        method,
        at: new Date().toISOString(),
        cashier: current.cashier,
      };
      const updated: Booking = {
        ...current,
        paid: r2(current.paid + settled),
        payments: settled ? [...current.payments, finalPayment] : current.payments,
        status: "collected",
        closedAt: new Date().toISOString(),
        saleReceiptNo: sale.receiptNo,
      };
      setState((s) => ({
        ...s,
        bookings: s.bookings.map((b) => (b.id === id ? updated : b)),
      }));
      logger.log("sale_event", "Booking collected", "bookings", {
        ref: updated.ref,
        receiptNo: sale.receiptNo,
        settled,
        total: updated.total,
      });
      return { booking: updated, sale };
    },
    [activeShift, recordSale],
  );

  const refundSale = useCallback((saleId: string) => {
    logger.log("sale_event", "Sale refunded", "receipts", {
      saleId,
      receiptNo: stateRef.current.sales.find((x) => x.id === saleId)?.receiptNo ?? null,
    });
    {
      const snap = stateRef.current;
      const sale = snap.sales.find((x) => x.id === saleId);
      if (sale && !sale.refunded) {
        const restocked = snap.products
          .filter((p) => sale.lines.some((l) => l.productId === p.id))
          .map((p) => bump(p, sale.storeId, sale.lines.find((l) => l.productId === p.id)!.qty));
        void db.refundSale(saleId, restocked);
      }
    }
    setState((s) => {
      const sale = s.sales.find((x) => x.id === saleId);
      if (!sale || sale.refunded) return s;
      const products = s.products.map((p) => {
        const line = sale.lines.find((l) => l.productId === p.id);
        return line ? bump(p, sale.storeId, line.qty) : p;
      });
      return {
        ...s,
        products,
        sales: s.sales.map((x) => (x.id === saleId ? { ...x, refunded: true } : x)),
      };
    });
  }, []);

  const upsertProduct = useCallback((product: Product) => {
    const prev = stateRef.current.products.find((p) => p.id === product.id);
    logger.log("inventory_edit", prev ? "Product updated" : "Product created", "inventory", {
      productId: product.id,
      name: product.name,
      barcode: product.barcode,
      previous: prev
        ? { name: prev.name, price: prev.price, cost: prev.cost, ecomPrice: prev.ecomPrice }
        : null,
      updated: {
        name: product.name,
        price: product.price,
        cost: product.cost,
        ecomPrice: product.ecomPrice,
      },
    });
    void db.upsertProduct(product);
    setState((s) => ({
      ...s,
      products: s.products.some((p) => p.id === product.id)
        ? s.products.map((p) => (p.id === product.id ? product : p))
        : [product, ...s.products],
    }));
  }, []);

  const removeProduct = useCallback((id: string) => {
    void db.deleteProduct(id);
    setState((s) => ({ ...s, products: s.products.filter((p) => p.id !== id) }));
  }, []);

  const adjustStock = useCallback((id: string, delta: number, storeId?: string) => {
    const target = storeId ?? stateRef.current.currentStoreId;
    const before = stateRef.current.products.find((p) => p.id === id);
    logger.log("inventory_edit", "Stock adjusted", "inventory", {
      productId: id,
      name: before?.name ?? null,
      storeId: target,
      delta,
      previousStock: before ? stockAt(before, target) : null,
      updatedStock: before ? stockAt(before, target) + delta : null,
    });
    if (before) void db.upsertProduct(bump(before, target, delta));
    setState((s) => ({
      ...s,
      products: s.products.map((p) =>
        p.id === id ? bump(p, storeId ?? s.currentStoreId, delta) : p,
      ),
    }));
  }, []);

  const upsertMember = useCallback((member: Member) => {
    const prev = stateRef.current.members.find((m) => m.id === member.id);
    logger.log("member_event", prev ? "Member profile edited" : "Member created", "members", {
      memberId: member.id,
      name: member.name,
      phone: member.phone,
      previous: prev ? { points: prev.points, tier: prev.tier, phone: prev.phone } : null,
      updated: { points: member.points, tier: member.tier, phone: member.phone },
      pointsDelta: prev ? member.points - prev.points : member.points,
    });
    void db.upsertMember(member);
    setState((s) => ({
      ...s,
      members: s.members.some((m) => m.id === member.id)
        ? s.members.map((m) => (m.id === member.id ? member : m))
        : [member, ...s.members],
    }));
  }, []);

  const removeMember = useCallback((id: string) => {
    void db.deleteMember(id);
    setState((s) => ({ ...s, members: s.members.filter((m) => m.id !== id) }));
  }, []);

  const upsertPromotion = useCallback((promotion: Promotion) => {
    void db.upsertPromotion(promotion);
    setState((s) => ({
      ...s,
      promotions: s.promotions.some((p) => p.id === promotion.id)
        ? s.promotions.map((p) => (p.id === promotion.id ? promotion : p))
        : [promotion, ...s.promotions],
    }));
  }, []);

  const removePromotion = useCallback((id: string) => {
    void db.deletePromotion(id);
    setState((s) => ({ ...s, promotions: s.promotions.filter((p) => p.id !== id) }));
  }, []);

  const togglePromotion = useCallback((id: string, active: boolean) => {
    {
      const p = stateRef.current.promotions.find((x) => x.id === id);
      if (p) void db.upsertPromotion({ ...p, active });
    }
    setState((s) => ({
      ...s,
      promotions: s.promotions.map((p) => (p.id === id ? { ...p, active } : p)),
    }));
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    logger.log("settings", "Settings updated", "settings", {
      previous: stateRef.current.settings,
      updated: patch,
    });
    {
      const prev = stateRef.current.settings;
      void db.saveSettings({
        tax: { ...prev.tax, ...(patch.tax ?? {}) },
        receipt: { ...prev.receipt, ...(patch.receipt ?? {}) },
        payment: { ...prev.payment, ...(patch.payment ?? {}) },
      });
    }
    setState((s) => ({
      ...s,
      settings: {
        tax: { ...s.settings.tax, ...(patch.tax ?? {}) },
        receipt: { ...s.settings.receipt, ...(patch.receipt ?? {}) },
        payment: { ...s.settings.payment, ...(patch.payment ?? {}) },
      },
    }));
  }, []);

  const createTransfer = useCallback((input: NewTransfer) => {
    const now = new Date().toISOString();
    const transfer: Transfer = {
      ...input,
      id: crypto.randomUUID(),
      ref: "",
      status: input.kind === "transfer" ? "in_transit" : "requested",
      createdAt: now,
      updatedAt: now,
    };
    setState((s) => {
      const transferCounter = s.transferCounter + 1;
      transfer.ref = `${input.kind === "transfer" ? "TRF" : "REQ"}-${String(
        transferCounter,
      ).padStart(5, "0")}`;
      // Goods only leave the source store once they are actually in transit.
      const products =
        transfer.status === "in_transit"
          ? bumpItems(s.products, input.items, input.fromStoreId, -1)
          : s.products;
      return { ...s, transferCounter, products, transfers: [transfer, ...s.transfers] };
    });
    if (transfer.status === "in_transit") {
      void db.upsertProducts(
        bumpItems(stateRef.current.products, input.items, input.fromStoreId, -1).filter((p) =>
          input.items.some((i) => i.productId === p.id),
        ),
      );
    }
    return transfer;
  }, []);

  const approveTransfer = useCallback((id: string) => {
    {
      const s = stateRef.current;
      const t = s.transfers.find((x) => x.id === id);
      if (t && t.status === "requested")
        void db.upsertProducts(
          bumpItems(s.products, t.items, t.fromStoreId, -1).filter((p) =>
            t.items.some((i) => i.productId === p.id),
          ),
        );
    }
    setState((s) => {
      const t = s.transfers.find((x) => x.id === id);
      if (!t || t.status !== "requested") return s;
      return {
        ...s,
        products: bumpItems(s.products, t.items, t.fromStoreId, -1),
        transfers: s.transfers.map((x) =>
          x.id === id ? { ...x, status: "in_transit", updatedAt: new Date().toISOString() } : x,
        ),
      };
    });
  }, []);

  const receiveTransfer = useCallback((id: string) => {
    {
      const s = stateRef.current;
      const t = s.transfers.find((x) => x.id === id);
      if (t && t.status === "in_transit")
        void db.upsertProducts(
          bumpItems(s.products, t.items, t.toStoreId, 1).filter((p) =>
            t.items.some((i) => i.productId === p.id),
          ),
        );
    }
    setState((s) => {
      const t = s.transfers.find((x) => x.id === id);
      if (!t || t.status !== "in_transit") return s;
      return {
        ...s,
        products: bumpItems(s.products, t.items, t.toStoreId, 1),
        transfers: s.transfers.map((x) =>
          x.id === id ? { ...x, status: "received", updatedAt: new Date().toISOString() } : x,
        ),
      };
    });
  }, []);

  const rejectTransfer = useCallback((id: string) => {
    {
      const s = stateRef.current;
      const t = s.transfers.find((x) => x.id === id);
      if (t && t.status === "in_transit")
        void db.upsertProducts(
          bumpItems(s.products, t.items, t.fromStoreId, 1).filter((p) =>
            t.items.some((i) => i.productId === p.id),
          ),
        );
    }
    setState((s) => {
      const t = s.transfers.find((x) => x.id === id);
      if (!t || (t.status !== "requested" && t.status !== "in_transit")) return s;
      // If stock already left the source store, put it back.
      const products =
        t.status === "in_transit"
          ? bumpItems(s.products, t.items, t.fromStoreId, 1)
          : s.products;
      return {
        ...s,
        products,
        transfers: s.transfers.map((x) =>
          x.id === id
            ? {
                ...x,
                status: t.status === "in_transit" ? "cancelled" : "rejected",
                updatedAt: new Date().toISOString(),
              }
            : x,
        ),
      };
    });
  }, []);

  const reset = useCallback(() => setState(seedState), []);

  const value: Ctx = {
    ready,
    state,
    stores: state.stores,
    currentStore,
    setCurrentStore,
    upsertStore,
    removeStore,
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
    upsertPromotion,
    removePromotion,
    togglePromotion,
    updateSettings,
    createTransfer,
    approveTransfer,
    receiveTransfer,
    rejectTransfer,
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

export function cartTotals(
  lines: CartLine[],
  cartDiscount: number,
  cartDiscountType: DiscountType = "amount",
  tax?: TaxSettings,
) {
  const subtotal = r2(lines.reduce((a, l) => a + l.price * l.qty, 0));
  const lineDiscount = r2(lines.reduce((a, l) => a + lineUnitDiscount(l) * l.qty, 0));
  const base = r2(subtotal - lineDiscount);
  const billDiscount = r2(
    cartDiscountType === "percent" ? (base * (cartDiscount || 0)) / 100 : cartDiscount || 0,
  );
  const discount = r2(lineDiscount + billDiscount);
  // Spread the bill-level discount proportionally so tax stays accurate.
  const ratio = base !== 0 ? (base - billDiscount) / base : 1;
  /** taxable value of the ticket after every discount */
  const net = r2(subtotal - discount);
  let taxAmount: number;
  let total: number;
  if (tax) {
    const rate = tax.enabled ? (tax.rate || 0) / 100 : 0;
    if (!tax.enabled) {
      taxAmount = 0;
      total = net;
    } else if (tax.mode === "inclusive") {
      // prices already carry the tax — pull it back out for reporting
      taxAmount = r2(net - net / (1 + rate));
      total = net;
    } else {
      taxAmount = r2(net * rate);
      total = r2(net + taxAmount);
    }
  } else {
    taxAmount = r2(
      lines.reduce((a, l) => a + (l.price - lineUnitDiscount(l)) * l.qty * l.taxRate * ratio, 0),
    );
    total = r2(net + taxAmount);
  }
  const credit = r2(
    lines.filter((l) => l.credit).reduce((a, l) => a + (l.price - lineUnitDiscount(l)) * -l.qty, 0),
  );
  return { subtotal, discount, lineDiscount, billDiscount, tax: taxAmount, total, credit, net };
}
