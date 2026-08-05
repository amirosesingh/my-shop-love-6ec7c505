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
  BookingPaymentTiming,
  CartLine,
  Member,
  PaymentMethod,
  PosState,
  Product,
  Promotion,
  Sale,
  Shift,
  Store,
  StockAdjustmentReason,
  TaxSettings,
  Transfer,
  TransferKind,
} from "./pos-types";
import { bookingBalance, lineUnitDiscount, r2, type DiscountType } from "./pos-types";
import { logger } from "./audit-log";
import { db, dbError, loadActiveShift, loadCloudState } from "./pos-db";
import type { CloudSlice } from "./pos-db";
import { clearSnapshot, readSnapshot, writeSnapshot } from "./offline-snapshot";
import { isLiveOnly } from "./live-mode";
import { useAuth } from "./pos-auth";
import { readTerminalConfig } from "./terminal-tokens";
import { isShiftOverdue, localTerminalId } from "./shift-hours";
import { beginShiftSession, endShiftSessions } from "./shift-sessions";
import { branchPolicy } from "./branch-policy";
import { setActiveBranchSyncPolicy } from "./sync-policy";
import { setPosTimeZone } from "./time-zone";

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
  /** hold the note as "requested" until somebody authorises it */
  needsApproval?: boolean;
};

export type NewBooking = {
  storeId: string;
  shiftId: string;
  lines: CartLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  /** what the booking is for, and what the job costs */
  serviceTypeId?: string;
  serviceName?: string;
  serviceFee?: number;
  /** up front, part deposit, or on collection */
  paymentTiming?: BookingPaymentTiming;
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
  applyStockCount: (
    entries: { productId: string; counted: number }[],
    reason: StockAdjustmentReason,
    note?: string,
    storeId?: string,
  ) => void;
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

/** Merge a cloud (or cached snapshot) slice into local state. */
function applyCloud(s: PosState, cloud: CloudSlice): PosState {
  const cloudShifts = cloud.shifts ?? [];
  const cloudProducts = cloud.products ?? [];
  const cloudMembers = cloud.members ?? [];
  const cloudSales = cloud.sales ?? [];
  const cloudPromotions = cloud.promotions ?? [];
  const cloudStores = cloud.stores ?? [];
  const cloudSettings = cloud.settings ?? ({} as CloudSlice["settings"]);
  return {
    ...s,
    products: cloudProducts,
    members: cloudMembers,
    sales: cloudSales,
    // Shifts are central now so every terminal agrees on what is open.
    shifts: cloudShifts.length ? cloudShifts : s.shifts,
    promotions: cloudPromotions.length ? cloudPromotions : s.promotions,
    // Locations are central now; the local list is the fallback until
    // the directory has been populated (and gets pushed up below).
    stores: cloudStores.length ? cloudStores : s.stores,
    currentStoreId: cloudStores.length
      ? (cloudStores.find((x) => x.id === s.currentStoreId)?.id ?? cloudStores[0].id)
      : s.currentStoreId,
    settings: {
      tax: { ...defaultSettings.tax, ...cloudSettings?.tax },
      receipt: { ...defaultSettings.receipt, ...cloudSettings?.receipt },
      payment: { ...defaultSettings.payment, ...cloudSettings?.payment },
      whatsapp: { ...defaultSettings.whatsapp, ...cloudSettings?.whatsapp },
      review: { ...defaultSettings.review, ...cloudSettings?.review },
      hours: { ...defaultSettings.hours, ...cloudSettings?.hours },
      integrations: { ...defaultSettings.integrations, ...cloudSettings?.integrations },
      visibility: { ...defaultSettings.visibility, ...cloudSettings?.visibility },
    },
    // Keep the bill counter ahead of every receipt already in the cloud.
    counter: cloudSales.reduce(
      (max, sale) => Math.max(max, Number(sale.receiptNo.split("-").pop()) || 0),
      s.counter,
    ),
  };
}

export function PosProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PosState>(seedState);
  const [ready, setReady] = useState(false);
  const { authUserId, terminalUser, user, isAdmin, isSupervisor, ready: authReady } = useAuth();
  // Nothing is fetched from the cloud until a cashier or supervisor session
  // exists — visitors never receive catalogue, member or sales data.
  const signedIn = Boolean(authUserId || terminalUser);
  // Latest snapshot for audit logging without re-creating every callback.
  const stateRef = useRef(state);
  stateRef.current = state;
  // Lets earlier callbacks reach the settings writer defined further down.
  const updateSettingsRef = useRef<((patch: Partial<AppSettings>) => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Local-only slices (stores, shifts, transfers, counters) stay on the
    // terminal; catalogue, members, bills, promos and settings come from cloud.
    try {
      // Android keeps nothing on the device — every slice is loaded live.
      const raw = isLiveOnly() ? null : window.localStorage.getItem(KEY);
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
      // Anonymous visitors get nothing: no products, members or sales.
      if (!signedIn) {
        if (authReady && !cancelled) setReady(true);
        return;
      }
      // Offline-first boot: paint the last known good snapshot immediately so
      // the till is usable with no connection, then refresh in the background.
      const snap = readSnapshot();
      if (snap && !cancelled) {
        try {
          setState((s) => applyCloud(s, snap));
        } catch {
          // A snapshot written by an older build must never brick the till.
          clearSnapshot();
        }
        setReady(true);
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (!cancelled) setReady(true);
        return;
      }
      try {
        const cloud = await loadCloudState();
        if (cancelled) return;
        writeSnapshot(cloud);
        setState((s) => applyCloud(s, cloud));
        if (!cloud.stores.length) db.upsertStores(stateRef.current.stores);
      } catch (e) {
        dbError("Loading data", e);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn, authReady]);

  useEffect(() => {
    if (!ready) return;
    if (isLiveOnly()) return;
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

  // Publish the branch's sync switches to the outbox drainer and the region
  // clock to every formatter, so both follow the saved settings.
  useEffect(() => {
    setActiveBranchSyncPolicy(branchPolicy(state.settings, state.currentStoreId));
  }, [state.settings, state.currentStoreId]);

  useEffect(() => {
    setPosTimeZone(state.settings.integrations.timeZone);
  }, [state.settings.integrations.timeZone]);

  // Authoritative open shift for this branch, straight from the database.
  // Falls back to the cached list when the terminal is offline. Purely
  // status-driven: a shift opened days ago stays active until it is closed.
  const [dbShift, setDbShift] = useState<Shift | null>(null);
  const [shiftChecked, setShiftChecked] = useState(false);

  const refreshActiveShift = useCallback(async () => {
    const storeId = stateRef.current.currentStoreId;
    try {
      const found = await loadActiveShift(storeId);
      setDbShift(found);
      setState((s) => ({
        ...s,
        shifts: found
          ? s.shifts.some((x) => x.id === found.id)
            ? s.shifts.map((x) => (x.id === found.id ? found : x))
            : [found, ...s.shifts]
          : s.shifts.map((x) =>
              x.storeId === storeId && !x.closedAt
                ? { ...x, status: "CLOSED" as const, closedAt: x.closedAt ?? new Date().toISOString() }
                : x,
            ),
      }));
    } catch {
      // Offline or unreachable: keep whatever the cached list knows.
      setDbShift(
        stateRef.current.shifts.find(
          (s) => s.storeId === storeId && s.status !== "CLOSED" && !s.closedAt,
        ) ?? null,
      );
    } finally {
      setShiftChecked(true);
    }
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setDbShift(null);
      setShiftChecked(false);
      return;
    }
    void refreshActiveShift();
  }, [signedIn, currentStore.id, refreshActiveShift]);

  // Android holds nothing locally, so coming back to the app must re-read the
  // catalogue, members, prices and shift from the backend.
  useEffect(() => {
    if (!isLiveOnly() || !signedIn) return;
    const resume = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      void loadCloudState()
        .then((cloud) => setState((s) => applyCloud(s, cloud)))
        .catch(() => {
          /* the offline gate takes over if the connection is gone */
        });
      void refreshActiveShift();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [signedIn, refreshActiveShift]);

  const activeShift = useMemo(() => {
    if (dbShift && dbShift.storeId === currentStore.id && !dbShift.closedAt) return dbShift;
    if (shiftChecked) return null;
    return (
      state.shifts.find(
        (s) => s.storeId === currentStore.id && s.status !== "CLOSED" && !s.closedAt,
      ) ?? null
    );
  }, [dbShift, shiftChecked, state.shifts, currentStore.id]);

  // Record the exact moment this user joined the open shift. Runs whenever the
  // signed-in account or the open shift changes, and is safe to repeat.
  useEffect(() => {
    const name = user?.name ?? terminalUser?.name;
    if (!activeShift || !name) return;
    const terminal = readTerminalConfig();
    beginShiftSession({
      shiftId: activeShift.id,
      storeId: activeShift.storeId,
      terminalId: activeShift.terminalId ?? terminal?.tokenId ?? localTerminalId(),
      terminalName: activeShift.terminalName ?? terminal?.locationName ?? "This PC",
      staffId: user?.staffId ?? terminalUser?.userCode ?? null,
      staffName: name,
      role: user?.role ?? terminalUser?.role ?? null,
    });
  }, [activeShift?.id, user?.staffId, user?.name, terminalUser?.userCode]);

  const setCurrentStore = useCallback(
    (id: string) => setState((s) => ({ ...s, currentStoreId: id })),
    [],
  );

  const upsertStore = useCallback((store: Store) => {
    db.upsertStore(store);
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
    db.deleteStore(id);
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
      const terminal = readTerminalConfig();
      logger.log("sale_event", "Shift opened", "shifts", {
        cashier,
        openingFloat,
        storeId: stateRef.current.currentStoreId,
        terminal: terminal?.locationName ?? "This PC",
      });
      const shift: Shift = {
        id: crypto.randomUUID(),
        storeId: stateRef.current.currentStoreId,
        cashier,
        openedAt: new Date().toISOString(),
        closedAt: null,
        openingFloat,
        countedCash: null,
        note: "",
        terminalId: terminal?.tokenId ?? localTerminalId(),
        terminalName: terminal?.locationName ?? "This PC",
        openedByStaffId: user?.staffId ?? terminalUser?.userCode,
        openedByRole: user?.role ?? terminalUser?.role,
        overdue: false,
        status: "OPEN",
        closingFloat: null,
        userId: authUserId ?? null,
      };
      db.upsertShift(shift);
      setState((s) => ({ ...s, shifts: [shift, ...s.shifts] }));
      setDbShift(shift);
      setShiftChecked(true);
    },
    [user, terminalUser, authUserId],
  );

  const closeShift = useCallback(
    (countedCash: number, note: string) => {
      if (!activeShift) return null;
      // Only the PC that opened the shift may close it — unless a manager or
      // admin is signed in, who can close from anywhere.
      const here = readTerminalConfig()?.tokenId ?? localTerminalId();
      const sameTerminal = !activeShift.terminalId || activeShift.terminalId === here;
      if (!sameTerminal && !isAdmin && !isSupervisor) return null;
      const closed: Shift = {
        ...activeShift,
        closedAt: new Date().toISOString(),
        countedCash,
        closingFloat: countedCash,
        status: "CLOSED",
        note,
        closedBy: user?.name ?? terminalUser?.name ?? activeShift.cashier,
        closedByStaffId: user?.staffId ?? terminalUser?.userCode,
        closedByRole: user?.role ?? terminalUser?.role,
        overdue: isShiftOverdue(activeShift, stateRef.current.settings.hours),
      };
      db.upsertShift(closed);
      // Everyone who was signed in on this shift is signed out with it.
      endShiftSessions({ shiftId: closed.id });
      setState((s) => ({
        ...s,
        shifts: s.shifts.map((x) => (x.id === closed.id ? closed : x)),
      }));
      setDbShift(null);
      setShiftChecked(true);
      logger.log("sale_event", "Shift closed", "shifts", {
        shiftId: closed.id,
        storeId: closed.storeId,
        openingFloat: closed.openingFloat,
        countedCash: countedCash,
        note,
        closedBy: closed.closedBy,
        overdue: closed.overdue,
      });
      return closed;
    },
    [activeShift, user, terminalUser, isAdmin, isSupervisor],
  );

  const recordSale = useCallback((input: Omit<Sale, "id" | "receiptNo" | "createdAt">) => {
    const snapshot = stateRef.current;
    const counter = snapshot.counter + 1;
    const store = snapshot.stores.find((x) => x.id === input.storeId);
    const sale: Sale = {
      ...input,
      id: crypto.randomUUID(),
      receiptNo: `${(store?.receiptPrefix?.trim() || store?.code || "R").toUpperCase()}-${String(
        counter,
      ).padStart(6, "0")}`,
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
      serviceTypeId: input.serviceTypeId,
      serviceName: input.serviceName,
      serviceFee: input.serviceFee,
      paymentTiming: input.paymentTiming,
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
    // The catalog is shared by every branch: make sure the product exists at
    // all stores (starting at zero) so it shows up everywhere after sync.
    const stockByStore = { ...product.stockByStore };
    for (const store of stateRef.current.stores) {
      if (stockByStore[store.id] === undefined) stockByStore[store.id] = 0;
    }
    const record: Product = { ...product, stockByStore };
    logger.log("inventory_edit", prev ? "Product updated" : "Product created", "inventory", {
      productId: record.id,
      name: record.name,
      barcode: record.barcode,
      previous: prev
        ? { name: prev.name, price: prev.price, cost: prev.cost, ecomPrice: prev.ecomPrice }
        : null,
      updated: {
        name: record.name,
        price: record.price,
        cost: record.cost,
        ecomPrice: record.ecomPrice,
      },
    });
    void db.upsertProduct(record);
    // A branch that keeps a private catalogue owns whatever it creates, so
    // the item never shows up at the other shops.
    if (!prev && branchPolicy(stateRef.current.settings, stateRef.current.currentStoreId).privateCatalogue) {
      const owners = {
        ...(stateRef.current.settings.integrations.productOwners ?? {}),
        [record.id]: stateRef.current.currentStoreId,
      };
      updateSettingsRef.current?.({
        integrations: { ...stateRef.current.settings.integrations, productOwners: owners },
      });
    }
    setState((s) => ({
      ...s,
      products: s.products.some((p) => p.id === record.id)
        ? s.products.map((p) => (p.id === record.id ? record : p))
        : [record, ...s.products],
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

  /**
   * Commits a physical stock count / adjustment: absolute counted quantities
   * replace the system figure and every variance is written to the trail with
   * a reason, so calibration differences can be audited later.
   */
  const applyStockCount = useCallback(
    (
      entries: { productId: string; counted: number }[],
      reason: StockAdjustmentReason,
      note = "",
      storeId?: string,
    ) => {
      const target = storeId ?? stateRef.current.currentStoreId;
      const changes = entries
        .map((e) => {
          const product = stateRef.current.products.find((p) => p.id === e.productId);
          if (!product) return null;
          const before = stockAt(product, target);
          const counted = Math.max(0, Math.round(e.counted));
          if (counted === before) return null;
          return { product, before, counted, delta: counted - before };
        })
        .filter(Boolean) as {
        product: Product;
        before: number;
        counted: number;
        delta: number;
      }[];
      if (!changes.length) return;

      for (const c of changes) {
        logger.log("inventory", "Stock adjusted", "inventory", {
          productId: c.product.id,
          name: c.product.name,
          sku: c.product.sku,
          storeId: target,
          reason,
          note,
          previousStock: c.before,
          updatedStock: c.counted,
          delta: c.delta,
          costImpact: r2(c.delta * (c.product.cost ?? 0)),
        });
        void db.upsertProduct({
          ...c.product,
          stockByStore: { ...c.product.stockByStore, [target]: c.counted },
        });
      }

      const byId = new Map(changes.map((c) => [c.product.id, c.counted]));
      setState((s) => ({
        ...s,
        products: s.products.map((p) =>
          byId.has(p.id)
            ? { ...p, stockByStore: { ...p.stockByStore, [target]: byId.get(p.id)! } }
            : p,
        ),
      }));
    },
    [],
  );

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
        whatsapp: { ...prev.whatsapp, ...(patch.whatsapp ?? {}) },
        review: { ...prev.review, ...(patch.review ?? {}) },
        hours: { ...prev.hours, ...(patch.hours ?? {}) },
        integrations: { ...prev.integrations, ...(patch.integrations ?? {}) },
        visibility: { ...prev.visibility, ...(patch.visibility ?? {}) },
      });
    }
    setState((s) => ({
      ...s,
      settings: {
        tax: { ...s.settings.tax, ...(patch.tax ?? {}) },
        receipt: { ...s.settings.receipt, ...(patch.receipt ?? {}) },
        payment: { ...s.settings.payment, ...(patch.payment ?? {}) },
        whatsapp: { ...s.settings.whatsapp, ...(patch.whatsapp ?? {}) },
        review: { ...s.settings.review, ...(patch.review ?? {}) },
        hours: { ...s.settings.hours, ...(patch.hours ?? {}) },
        integrations: { ...s.settings.integrations, ...(patch.integrations ?? {}) },
        visibility: { ...s.settings.visibility, ...(patch.visibility ?? {}) },
      },
    }));
  }, []);
  updateSettingsRef.current = updateSettings;

  const createTransfer = useCallback((input: NewTransfer) => {
    const now = new Date().toISOString();
    const { needsApproval, ...rest } = input;
    const transfer: Transfer = {
      ...rest,
      id: crypto.randomUUID(),
      ref: "",
      status: input.kind === "transfer" && !needsApproval ? "in_transit" : "requested",
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
    createBooking,
    addBookingPayment,
    collectBooking,
    cancelBooking,
    upsertProduct,
    removeProduct,
    adjustStock,
    applyStockCount,
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
