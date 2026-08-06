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
  JobStatus,
  Member,
  PaymentMethod,
  PosState,
  Product,
  Promotion,
  RacketJob,
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
import { useAuth } from "@/lib/pos-auth";
import { readTerminalConfig } from "./terminal-tokens";
import { isShiftOverdue, localTerminalId } from "./shift-hours";
import { beginShiftSession, endShiftSessions } from "./shift-sessions";
import { branchPolicy } from "./branch-policy";
import { setActiveBranchSyncPolicy } from "./sync-policy";
import { setPosFormats, setPosTimeZone } from "./time-zone";
import { receiveTransferInDb, saveTransfer, setTransferStatus } from "./stock-transfers";
import { commitBooking, loadBookings, saveBookingQuietly } from "./bookings-db";

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
  /** racket stringing job card, when the booking is a string job */
  job?: RacketJob;
};

/** Racket stringing job card captured with the booking. */
export type NewBookingJob = RacketJob;

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
  openShift: (cashier: string, openingFloat: number) => Promise<void>;
  closeShift: (countedCash: number, note: string) => Promise<Shift | null>;
  activeShift: Shift | null;
  recordSale: (sale: Omit<Sale, "id" | "receiptNo" | "createdAt">) => Promise<Sale>;
  refundSale: (saleId: string) => void;
  changeSalePayment: (saleId: string, method: PaymentMethod, reason?: string) => void;
  createBooking: (input: NewBooking) => Promise<Booking>;
  setBookingJobStatus: (id: string, status: JobStatus, who: string) => Booking | null;
  addBookingPayment: (
    id: string,
    amount: number,
    method: PaymentMethod,
    cashier: string,
  ) => Promise<Booking | null>;
  collectBooking: (
    id: string,
    amount: number,
    method: PaymentMethod,
  ) => Promise<{ booking: Booking; sale: Sale } | null>;
  cancelBooking: (id: string, reason: string) => void;
  deleteBooking: (id: string, reason: string) => Promise<void>;
  upsertProduct: (product: Product) => void;
  removeProduct: (id: string) => void;
  removeProducts: (ids: string[]) => void;
  patchProducts: (ids: string[], patch: Partial<Product>) => void;
  mergeProducts: (masterId: string, duplicateIds: string[]) => void;
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
  // Who is acting right now — stamped on transfer approvals and receipts.
  const actorRef = useRef("Manager");
  actorRef.current = terminalUser?.name || user?.email || "Manager";
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
        // Bookings and racket job cards live in the cloud so every till and
        // the phone see the same list.
        try {
          const cloudBookings = await loadBookings();
          if (!cancelled && cloudBookings.length) {
            setState((s: PosState) => {
              const seen = new Set(cloudBookings.map((b) => b.id));
              return { ...s, bookings: [...cloudBookings, ...s.bookings.filter((b) => !seen.has(b.id))] };
            });
          }
        } catch {
          /* offline or not permitted — the local list still works */
        }
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
    setPosFormats(
      state.settings.integrations.dateFormat,
      state.settings.integrations.timeFormat,
    );
  }, [
    state.settings.integrations.timeZone,
    state.settings.integrations.dateFormat,
    state.settings.integrations.timeFormat,
  ]);

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
    async (cashier: string, openingFloat: number) => {
      const terminal = readTerminalConfig();
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
      // Nothing opens until the shift is stored (cloud, local DB or offline queue).
      await db.commitShift(shift);
      logger.log("sale_event", "Shift opened", "shifts", {
        cashier,
        openingFloat,
        storeId: stateRef.current.currentStoreId,
        terminal: terminal?.locationName ?? "This PC",
      });
      setState((s) => ({ ...s, shifts: [shift, ...s.shifts] }));
      setDbShift(shift);
      setShiftChecked(true);
    },
    [user, terminalUser, authUserId],
  );

  const closeShift = useCallback(
    async (countedCash: number, note: string) => {
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
      await db.commitShift(closed);
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

  const recordSale = useCallback(async (input: Omit<Sale, "id" | "receiptNo" | "createdAt">) => {
    const snapshot = stateRef.current;
    const counter = snapshot.counter + 1;
    const store = snapshot.stores.find((x) => x.id === input.storeId);
    const sale: Sale = {
      ...input,
      // Stamp the cost price of every line at the moment of sale so margin
      // reports stay accurate when prices change later.
      lines: input.lines.map((l) => ({
        ...l,
        cost:
          l.cost ??
          snapshot.products.find((p) => p.id === l.productId)?.cost ??
          0,
      })),
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
    // The bill is only real once it is stored somewhere.
    await db.commitSale(sale, touchedProducts, updatedMember);

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

  const createBooking = useCallback(async (input: NewBooking) => {
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
      job: input.job,
      jobStatus: input.job ? "received" : undefined,
      jobStatusBy: input.job ? input.cashier : undefined,
      jobStatusAt: input.job ? now : undefined,
    };
    await commitBooking(booking);
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
    async (id: string, amount: number, method: PaymentMethod, cashier: string) => {
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
      await commitBooking(updated);
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
    const cancelled: Booking = {
      ...current,
      status: "cancelled",
      closedAt: new Date().toISOString(),
      note: reason ? `${current.note ? `${current.note} · ` : ""}Cancelled: ${reason}` : current.note,
    };
    setState((s) => ({
      ...s,
      bookings: s.bookings.map((b) => (b.id === id ? cancelled : b)),
    }));
    saveBookingQuietly(cancelled);
    logger.log("sale_event", "Booking cancelled", "bookings", {
      ref: current.ref,
      reason,
      refundable: current.paid,
    });
  }, []);

  /** Move a racket through received → strung → ready → collected. */
  const setBookingJobStatus = useCallback((id: string, status: JobStatus, who: string) => {
    const current = stateRef.current.bookings.find((b) => b.id === id);
    if (!current) return null;
    const updated: Booking = {
      ...current,
      jobStatus: status,
      jobStatusBy: who,
      jobStatusAt: new Date().toISOString(),
    };
    setState((s) => ({
      ...s,
      bookings: s.bookings.map((b) => (b.id === id ? updated : b)),
    }));
    saveBookingQuietly(updated);
    logger.log("sale_event", "Job card status changed", "bookings", {
      ref: updated.ref,
      status,
      by: who,
      customer: updated.customerName,
    });
    return updated;
  }, []);

  const collectBooking = useCallback(
    async (id: string, amount: number, method: PaymentMethod) => {
      const current = stateRef.current.bookings.find((b) => b.id === id);
      if (!current || current.status !== "active") return null;
      const balance = bookingBalance(current);
      const settled = r2(Math.min(Math.max(amount, 0), balance));
      const sale = await recordSale({
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
        jobStatus: current.job ? "collected" : current.jobStatus,
        jobStatusAt: current.job ? new Date().toISOString() : current.jobStatusAt,
      };
      await commitBooking(updated);
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

  /** Correct the tender recorded on a completed bill (e.g. rung up as card). */
  const changeSalePayment = useCallback(
    (saleId: string, method: PaymentMethod, reason?: string) => {
      const sale = stateRef.current.sales.find((x) => x.id === saleId);
      if (!sale || sale.method === method) return;
      logger.log("sale_event", "Bill payment method corrected", "receipts", {
        saleId,
        receiptNo: sale.receiptNo,
        from: sale.method,
        to: method,
        reason: reason ?? null,
      });
      void db.updateSalePayment(saleId, method);
      setState((s) => ({
        ...s,
        sales: s.sales.map((x) => (x.id === saleId ? { ...x, method } : x)),
      }));
    },
    [],
  );

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
    const product = stateRef.current.products.find((p) => p.id === id);
    logger.log("inventory_edit", "Product deleted", "inventory", {
      productId: id,
      name: product?.name ?? null,
      barcode: product?.barcode ?? null,
    });
    void db.deleteProduct(id);
    setState((s) => ({ ...s, products: s.products.filter((p) => p.id !== id) }));
  }, []);

  /** Bulk delete from the inventory selection — one trail entry per item. */
  const removeProducts = useCallback((ids: string[]) => {
    const set = new Set(ids);
    for (const id of ids) {
      const product = stateRef.current.products.find((p) => p.id === id);
      logger.log("inventory_edit", "Product deleted", "inventory", {
        productId: id,
        name: product?.name ?? null,
        barcode: product?.barcode ?? null,
        bulk: true,
      });
      void db.deleteProduct(id);
    }
    setState((s) => ({ ...s, products: s.products.filter((p) => !set.has(p.id)) }));
  }, []);

  /** Bulk field edit (category, tax, web visibility…) across a selection. */
  const patchProducts = useCallback((ids: string[], patch: Partial<Product>) => {
    const set = new Set(ids);
    const updated = stateRef.current.products
      .filter((p) => set.has(p.id))
      .map((p) => ({ ...p, ...patch }));
    logger.log("inventory_edit", "Products bulk edited", "inventory", {
      count: updated.length,
      changes: patch,
      names: updated.slice(0, 10).map((p) => p.name),
    });
    void db.upsertProducts(updated);
    setState((s) => ({
      ...s,
      products: s.products.map((p) => (set.has(p.id) ? { ...p, ...patch } : p)),
    }));
  }, []);

  /**
   * Folds duplicate product records into one master: branch stock is added
   * together and every losing barcode/SKU becomes an alias on the master, so
   * scanning the old code still finds the item.
   */
  const mergeProducts = useCallback((masterId: string, duplicateIds: string[]) => {
    const all = stateRef.current.products;
    const master = all.find((p) => p.id === masterId);
    if (!master) return;
    const losers = all.filter((p) => duplicateIds.includes(p.id) && p.id !== masterId);
    if (!losers.length) return;

    const stockByStore = { ...master.stockByStore };
    const aliases = new Set([...(master.barcodes ?? [])]);
    for (const loser of losers) {
      for (const [storeId, qty] of Object.entries(loser.stockByStore ?? {})) {
        stockByStore[storeId] = (stockByStore[storeId] ?? 0) + (qty || 0);
      }
      for (const code of [loser.barcode, loser.sku, ...(loser.barcodes ?? [])]) {
        if (code && code !== master.barcode && code !== master.sku) aliases.add(code);
      }
    }
    const merged: Product = { ...master, stockByStore, barcodes: [...aliases] };

    logger.log("inventory_edit", "Products merged", "inventory", {
      masterId,
      masterName: master.name,
      merged: losers.map((l) => ({ id: l.id, name: l.name, barcode: l.barcode })),
      aliasBarcodes: merged.barcodes,
    });

    void db.upsertProduct(merged);
    for (const loser of losers) void db.deleteProduct(loser.id);

    const gone = new Set(losers.map((l) => l.id));
    setState((s) => ({
      ...s,
      products: s.products
        .filter((p) => !gone.has(p.id))
        .map((p) => (p.id === masterId ? merged : p)),
    }));
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
    if (before)
      db.recordStockAdjustment({
        productId: before.id,
        productName: before.name,
        sku: before.sku ?? null,
        storeId: target,
        reason: "manual",
        previousStock: stockAt(before, target),
        updatedStock: stockAt(before, target) + delta,
        delta,
        costImpact: r2(delta * (before.cost ?? 0)),
      });
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
        db.recordStockAdjustment({
          productId: c.product.id,
          productName: c.product.name,
          sku: c.product.sku ?? null,
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
    const member = stateRef.current.members.find((m) => m.id === id);
    logger.log("member_event", "Member deleted", "members", {
      memberId: id,
      name: member?.name ?? null,
      phone: member?.phone ?? null,
    });
    void db.deleteMember(id);
    setState((s) => ({ ...s, members: s.members.filter((m) => m.id !== id) }));
  }, []);

  const upsertPromotion = useCallback((promotion: Promotion) => {
    const previous = stateRef.current.promotions.find((p) => p.id === promotion.id);
    logger.log("promotion", previous ? "Promotion updated" : "Promotion created", "promotions", {
      promotionId: promotion.id,
      name: promotion.name,
      active: promotion.active,
    });
    void db.upsertPromotion(promotion);
    setState((s) => ({
      ...s,
      promotions: s.promotions.some((p) => p.id === promotion.id)
        ? s.promotions.map((p) => (p.id === promotion.id ? promotion : p))
        : [promotion, ...s.promotions],
    }));
  }, []);

  const removePromotion = useCallback((id: string) => {
    const promotion = stateRef.current.promotions.find((p) => p.id === id);
    logger.log("promotion", "Promotion deleted", "promotions", {
      promotionId: id,
      name: promotion?.name ?? null,
    });
    void db.deletePromotion(id);
    setState((s) => ({ ...s, promotions: s.promotions.filter((p) => p.id !== id) }));
  }, []);

  const togglePromotion = useCallback((id: string, active: boolean) => {
    {
      const p = stateRef.current.promotions.find((x) => x.id === id);
      if (p) {
        logger.log("promotion", active ? "Promotion enabled" : "Promotion disabled", "promotions", {
          promotionId: id,
          name: p.name,
        });
        void db.upsertPromotion({ ...p, active });
      }
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
    logger.log("inventory", "Stock transfer created", "transfers", {
      transferId: transfer.id,
      ref: transfer.ref,
      kind: transfer.kind,
      fromStoreId: transfer.fromStoreId,
      toStoreId: transfer.toStoreId,
      itemCount: transfer.items.length,
      quantity: transfer.items.reduce((sum, item) => sum + item.qty, 0),
      status: transfer.status,
    });
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
    void saveTransfer({
      transfer,
      from: stateRef.current.stores.find((x) => x.id === transfer.fromStoreId),
      to: stateRef.current.stores.find((x) => x.id === transfer.toStoreId),
      products: stateRef.current.products,
    }).catch((e: unknown) => dbError("Saving transfer", e as Error));
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
    void setTransferStatus(id, "in_transit", actorRef.current)
      .catch((e: unknown) => dbError("Approving transfer", e));
    const transfer = stateRef.current.transfers.find((x) => x.id === id);
    logger.log("inventory", "Stock transfer approved", "transfers", {
      transferId: id,
      ref: transfer?.ref ?? null,
      fromStoreId: transfer?.fromStoreId ?? null,
      toStoreId: transfer?.toStoreId ?? null,
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
    // Stock already left the sender at dispatch, so the database only books
    // the goods in — and re-maps them when the branches sit in different groups.
    void receiveTransferInDb(id, actorRef.current).catch((e: unknown) =>
      dbError("Receiving transfer", e as Error),
    );
    const transfer = stateRef.current.transfers.find((x) => x.id === id);
    logger.log("inventory", "Stock transfer received", "transfers", {
      transferId: id,
      ref: transfer?.ref ?? null,
      fromStoreId: transfer?.fromStoreId ?? null,
      toStoreId: transfer?.toStoreId ?? null,
    });
  }, []);

  const rejectTransfer = useCallback((id: string) => {
    const transfer = stateRef.current.transfers.find((x) => x.id === id);
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
      void setTransferStatus(
        id,
        t.status === "in_transit" ? "cancelled" : "rejected",
        actorRef.current,
      ).catch((e: unknown) => dbError("Updating transfer", e));
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
    logger.log("inventory", transfer?.status === "in_transit" ? "Stock transfer cancelled" : "Stock transfer rejected", "transfers", {
      transferId: id,
      ref: transfer?.ref ?? null,
      fromStoreId: transfer?.fromStoreId ?? null,
      toStoreId: transfer?.toStoreId ?? null,
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
    changeSalePayment,
    createBooking,
    addBookingPayment,
    collectBooking,
    cancelBooking,
    setBookingJobStatus,
    upsertProduct,
    removeProduct,
    removeProducts,
    patchProducts,
    mergeProducts,
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
