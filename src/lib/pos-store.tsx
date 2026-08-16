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
import { defaultSettings, emptyState } from "./pos-seed";
import { describeDeleteBlock, type BlockedDelete } from "./product-delete";
import type {
  AppSettings,
  Booking,
  BookingPayment,
  BookingPaymentTiming,
  CartLine,
  IntakeCharge,
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
  StringOrigin,
  TaxSettings,
  Transfer,
  TransferKind,
} from "./pos-types";
import { bookingBalance, lineUnitDiscount, r2, type DiscountType } from "./pos-types";
import { logger } from "./audit-log";
import { toast } from "sonner";
import { db, dbError, loadActiveShift, loadCloudState, openShiftOnServer } from "./pos-db";
import { recordActivity } from "./activity-events";
import type { CloudSlice, CommitTarget } from "./pos-db";
import { clearSnapshot, readSnapshot, writeSnapshot } from "./offline-snapshot";
import { isLiveOnly } from "./live-mode";
import { useAuth } from "@/lib/pos-auth";
import { readTerminalConfig } from "./terminal-tokens";
import { nextBillNumber } from "./bill-number";
import { loadCashierToken, loadSessionToken } from "./pos-credentials";
import {
  activeBranchId,
  bindTerminalBranch,
  requireBranchId,
  setKnownBranches,
} from "./active-branch";
import { isShiftOverdue, localTerminalId } from "./shift-hours";
import { beginShiftSession, endShiftSessions } from "./shift-sessions";
import { setPublicHosts } from "./coupon-hosts";
import { branchPolicy } from "./branch-policy";
import { setActiveBranchSyncPolicy } from "./sync-policy";
import { setPosFormats, setPosTimeZone } from "./time-zone";
import { receiveTransferInDb, saveTransfer, setTransferStatus } from "./stock-transfers";
import { commitBooking, deleteBookingRow, loadBookings, saveBookingQuietly } from "./bookings-db";
import {
  clearSectionOverride,
  emptyBranchSettings,
  emptyScopeIds,
  loadBranchSettings,
  saveSectionOverride,
  setSectionLock,
  SETTING_TIERS,
  type BranchSettingsState,
  type ScopeIds,
  type SettingSource,
  type SettingTier,
} from "./branch-settings";
import {
  SECTION_BY_ID,
  getPath,
  mergePatch,
  patchPaths,
  pickSection,
  sectionOfPath,
  setPath,
  type SettingsSectionId,
} from "./settings-sections";

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
  /** quick job tag used when no customer is attached yet */
  tagId?: string;
  /** who dropped the racket off ("Dropped off by Coach Alex") */
  intakeNote?: string;
  stringOrigin?: StringOrigin;
  stringProductId?: string;
  gripProductId?: string;
  /** priced breakdown: labour, string, grip, add-ons */
  charges?: IntakeCharge[];
  /** customer accepted the service & high-tension liability terms */
  liabilityAccepted?: boolean;
  /** stringer assigned at intake */
  technician?: string;
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
  openShift: (cashier: string, openingFloat: number) => Promise<CommitTarget>;
  closeShift: (
    countedCash: number,
    note: string,
    extras?: Partial<
      Pick<
        Shift,
        | "countedCard"
        | "countedDigital"
        | "expectedCash"
        | "expectedCard"
        | "expectedDigital"
        | "varianceCash"
        | "varianceCard"
        | "varianceDigital"
        | "varianceTotal"
      >
    >,
  ) => Promise<Shift | null>;
  activeShift: Shift | null;
  /** Set when the last open-shift read failed; the till keeps trading. */
  shiftReadError: string | null;
  /** False until the first open-shift read has answered. */
  shiftChecked: boolean;
  recordSale: (
    sale: Omit<Sale, "id" | "receiptNo" | "createdAt"> & { receiptNo?: string },
  ) => Promise<Sale>;
  refundSale: (saleId: string) => void;
  changeSalePayment: (saleId: string, method: PaymentMethod, reason?: string) => void;
  createBooking: (input: NewBooking) => Promise<Booking>;
  setBookingJobStatus: (
    id: string,
    status: JobStatus,
    who: string,
    incidentNote?: string,
  ) => Booking | null;
  /** Edit the technical specs of an existing racket job before payment. */
  updateBookingSpecs: (id: string, job: RacketJob) => Booking | null;
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
  upsertProduct: (product: Product) => Promise<CommitTarget>;
  removeProduct: (id: string) => Promise<BlockedDelete[]>;
  removeProducts: (ids: string[]) => Promise<BlockedDelete[]>;
  patchProducts: (ids: string[], patch: Partial<Product>) => void;
  archiveProducts: (ids: string[]) => void;
  restoreProducts: (ids: string[]) => void;
  mergeProducts: (masterId: string, duplicateIds: string[]) => Promise<BlockedDelete[]>;
  adjustStock: (id: string, delta: number, storeId?: string) => void;
  /** Re-read the given products from the database into local state. */
  syncProducts: (ids: string[]) => Promise<void>;
  applyStockCount: (
    entries: { productId: string; counted: number }[],
    reason: StockAdjustmentReason,
    note?: string,
    storeId?: string,
  ) => void;
  upsertMember: (member: Member) => Promise<CommitTarget>;
  removeMember: (id: string) => void;
  upsertPromotion: (promotion: Promotion) => Promise<CommitTarget>;
  removePromotion: (id: string) => void;
  togglePromotion: (id: string, active: boolean) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  /** Which settings blocks each tier overrides, and which are locked globally. */
  settingsScope: BranchSettingsState;
  /** The cluster / branch / private ids this terminal resolves settings against. */
  scopeIds: ScopeIds;
  /** Start (or stop) overriding one block at one tier. */
  setSectionScope: (
    section: SettingsSectionId,
    on: boolean,
    tier?: SettingTier,
    scopeId?: string,
  ) => Promise<void>;
  /** Where the value at a dotted settings path is coming from right now. */
  sourceOfPath: (path: string) => SettingSource;
  /** Lock a block so no branch can override it. */
  setSectionLocked: (section: SettingsSectionId, locked: boolean) => Promise<void>;
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
    // A registered till never drifts to another branch: if the terminal is
    // bound and that branch exists centrally, it wins over anything saved.
    currentStoreId: (() => {
      const bound = activeBranchId(null);
      if (bound && cloudStores.some((x) => x.id === bound)) return bound;
      if (!cloudStores.length) return s.currentStoreId;
      return cloudStores.find((x) => x.id === s.currentStoreId)?.id ?? cloudStores[0].id;
    })(),
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
  const [state, setState] = useState<PosState>(emptyState);
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
  // Scoped overrides (cluster / branch / private) and global locks.
  const [scope, setScope] = useState<BranchSettingsState>(emptyBranchSettings);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  // Which cluster, branch and person this terminal resolves settings against.
  const scopeIds = useMemo<ScopeIds>(() => {
    const store = state.stores.find((s) => s.id === state.currentStoreId);
    return {
      CLUSTER: store?.groupId ?? "",
      BRANCH: state.currentStoreId ?? "",
      PRIVATE: user?.staffId ?? terminalUser?.userCode ?? authUserId ?? "",
    };
  }, [state.stores, state.currentStoreId, user?.staffId, terminalUser?.userCode, authUserId]);
  const scopeIdsRef = useRef<ScopeIds>(emptyScopeIds);
  scopeIdsRef.current = scopeIds;
  const whoRef = useRef("Manager");
  whoRef.current = actorRef.current;
  // Lets earlier callbacks reach the settings writer defined further down.
  const updateSettingsRef = useRef<((patch: Partial<AppSettings>) => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    // A read that never answers must not keep the till on the loader: after
    // this the app opens on whatever data it already has.
    const watchdog = window.setTimeout(() => {
      if (!cancelled) setReady(true);
    }, 15000);
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
        // The PIN/session proofs live in encrypted device storage. Load them
        // before branch discovery decides whether the protected relay exists.
        await Promise.all([loadCashierToken(), loadSessionToken()]);
        const cloud = await loadCloudState();
        if (cancelled) return;
        writeSnapshot(cloud);
        setState((s) => applyCloud(s, cloud));
        // No backfill here on purpose: an empty branch list means the operator
        // deleted them, and re-creating them would undo that.
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
      window.clearTimeout(watchdog);
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

  // Overrides follow the cluster, branch and person in context.
  useEffect(() => {
    if (!signedIn || !state.currentStoreId) return;
    let cancelled = false;
    void loadBranchSettings(scopeIds).then((next) => {
      if (!cancelled) setScope(next);
    });
    return () => {
      cancelled = true;
    };
  }, [signedIn, state.currentStoreId, scopeIds]);

  // The directory may not have loaded yet (a cashier signs in with a PIN and
  // has no central-database account of their own). The terminal's own
  // activation claim still knows the branch, so use it rather than showing a
  // placeholder that reads "No branch yet" and locks the register.
  const currentStore = useMemo(() => {
    const found =
      state.stores.find((s) => s.id === state.currentStoreId) ?? state.stores[0];
    if (found) return found;
    const terminal = readTerminalConfig();
    const boundId = (terminal?.locationId ?? "").trim() || state.currentStoreId.trim();
    return {
      id: boundId,
      code: "",
      name: (terminal?.locationName ?? "").trim() || (boundId ? "This branch" : "No branch yet"),
      address: "",
      phone: "",
    };
  }, [state.stores, state.currentStoreId]);

  // Let the shared branch resolver fall back to the only branch that exists.
  useEffect(() => {
    setKnownBranches(state.stores.map((s) => s.id));
  }, [state.stores]);

  // Publish the branch's sync switches to the outbox drainer and the region
  // clock to every formatter, so both follow the saved settings.
  useEffect(() => {
    setActiveBranchSyncPolicy(branchPolicy(state.settings, state.currentStoreId));
  }, [state.settings, state.currentStoreId]);

  // Public member / redeem domains are admin-configured, never hardcoded.
  useEffect(() => {
    setPublicHosts(
      state.settings.integrations.memberDomain,
      state.settings.integrations.redeemDomain,
    );
  }, [state.settings.integrations.memberDomain, state.settings.integrations.redeemDomain]);

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
  const [shiftReadError, setShiftReadError] = useState<string | null>(null);
  // A shift opened on this till a moment ago is trusted even if the next read
  // has not caught up yet — a slow replica must never re-lock the register.
  const justOpenedRef = useRef<{ shift: Shift; at: number } | null>(null);

  const refreshActiveShift = useCallback(async () => {
    // The terminal's registered branch wins, so the read always matches the
    // branch the shift was opened against.
    const storeId = activeBranchId(stateRef.current.currentStoreId) ?? stateRef.current.currentStoreId;
    try {
      const found = await loadActiveShift(storeId);
      const fresh = justOpenedRef.current;
      // A shift opened on this till stays open until it is closed here. A read
      // that cannot see it yet (replica lag, offline queue) must never re-lock
      // the register, however long ago it was opened.
      if (!found && fresh && fresh.shift.storeId === storeId) {
        setShiftReadError(null);
        setDbShift(fresh.shift);
        return;
      }
      setShiftReadError(null);
      setDbShift(found);
      // Only a real close ends a shift. An empty read never rewrites the
      // cached shift to CLOSED — the database row stays OPEN, and marking it
      // closed locally is what used to lock a trading till after a sign-out.
      if (found) {
        const row = found;
        setState((s) => ({
          ...s,
          shifts: s.shifts.some((x) => x.id === row.id)
            ? s.shifts.map((x) => (x.id === row.id ? row : x))
            : [row, ...s.shifts],
        }));
      }
    } catch (e) {
      // Offline, refused or unreachable: never downgrade a trading till to
      // "locked" — keep the last known open shift and say we are reconnecting.
      setShiftReadError((e as Error).message || "Could not reach the central database");
      setDbShift(
        (prev) =>
          (prev && prev.storeId === storeId && !prev.closedAt ? prev : null) ??
          justOpenedRef.current?.shift ??
          stateRef.current.shifts.find(
            (s) => s.storeId === storeId && s.status !== "CLOSED" && !s.closedAt,
          ) ??
          null,
      );
    } finally {
      setShiftChecked(true);
    }
  }, []);

  useEffect(() => {
    if (!signedIn) {
      // Signing out never closes the shift: keep the last known open shift so
      // the next cashier walks straight back into it while the re-read runs.
      setShiftChecked(false);
      return;
    }
    void refreshActiveShift();
  }, [signedIn, currentStore.id, refreshActiveShift]);

  // A registered till trades in its own branch — pin the view to it as soon as
  // that branch exists in the directory, before any shift read runs.
  useEffect(() => {
    // Persist the terminal's branch first, so every later read has one source.
    bindTerminalBranch();
    const bound = activeBranchId(null);
    if (!bound) return;
    // The branch is pinned even before the directory arrives — a registered
    // till knows its own branch, and waiting for the store list is what left
    // the register on "No branch yet".
    setState((s) => (s.currentStoreId === bound ? s : { ...s, currentStoreId: bound }));
  }, [state.stores, signedIn]);

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

  // Pull sync: tills and desktops refresh the master data (catalogue, prices,
  // members, branches, settings) from the cloud on a timer and whenever the
  // connection comes back, so register search and barcode scans stay current
  // even when the machine later goes offline again.
  useEffect(() => {
    if (isLiveOnly() || !signedIn) return;
    let cancelled = false;
    const pull = () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void loadCloudState()
        .then((cloud) => {
          if (cancelled) return;
          writeSnapshot(cloud);
          // Only master data is replaced; anything created on this till that
          // has not synced yet stays untouched by applyCloud's merge.
          setState((s) => applyCloud(s, cloud));
        })
        .catch(() => {
          /* offline or refused — the local copy keeps the till trading */
        });
    };
    const timer = window.setInterval(pull, 5 * 60 * 1000);
    window.addEventListener("online", pull);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("online", pull);
    };
  }, [signedIn]);

  const activeShift = useMemo(() => {
    const branch = activeBranchId(currentStore.id) ?? currentStore.id;
    if (dbShift && dbShift.storeId === branch && !dbShift.closedAt) return dbShift;
    if (shiftChecked) return null;
    return (
      state.shifts.find(
        (s) => s.storeId === branch && s.status !== "CLOSED" && !s.closedAt,
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

  // Signing in on a shift somebody else already opened is never interrupted by
  // the opening screen — say so once, then get out of the way.
  const announcedShiftRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeShift || !signedIn) return;
    if (announcedShiftRef.current === activeShift.id) return;
    announcedShiftRef.current = activeShift.id;
    // The till that just opened the shift already saw its own confirmation.
    if (justOpenedRef.current?.shift.id === activeShift.id) return;
    const branch =
      stateRef.current.stores.find((s) => s.id === activeShift.storeId)?.name ??
      activeShift.storeId;
    toast.success(`Continuing active shift opened at ${branch}`, {
      description: `Opened by ${activeShift.cashier} · float ${money(activeShift.openingFloat)}`,
    });
  }, [activeShift?.id, signedIn]);

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
        currentStoreId: s.currentStoreId === id ? (stores[0]?.id ?? "") : s.currentStoreId,
      };
    });
  }, []);

  const openShift = useCallback(
    async (cashier: string, openingFloat: number) => {
      const terminal = readTerminalConfig();
      // The branch follows the terminal, never the staff record.
      const storeId = requireBranchId(stateRef.current.currentStoreId);
      const shift: Shift = {
        id: crypto.randomUUID(),
        storeId,
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
      // The central database stores the shift and hands the stored row back in
      // one call, so nothing has to be read again through the access rules.
      const stored = await openShiftOnServer(shift);
      let target: CommitTarget = "cloud";
      if (stored) {
        Object.assign(shift, stored);
      } else {
        // Offline, local SQL or queued: nothing opens until it is stored.
        target = await db.commitShift(shift);
        if (target === "cloud" && (await db.shiftExists(shift.id)) === "no") {
          throw new Error(
            "The shift was not found in the database after saving. Nothing was opened — try again, or check this account's branch and role.",
          );
        }
      }
      logger.log("sale_event", "Shift opened", "shifts", {
        cashier,
        openingFloat,
        storeId,
        terminal: terminal?.locationName ?? "This PC",
      });
      recordActivity({
        type: "shift_open",
        title: "Shift opened",
        message: `${cashier} opened a shift with a float of ${openingFloat}.`,
        actorName: cashier,
        actorRole: user?.role ?? terminalUser?.role ?? null,
        terminalId: shift.terminalId ?? null,
        terminalName: shift.terminalName ?? null,
        storeId,
        entityType: "shift",
        entityId: shift.id,
        amount: openingFloat,
      });
      setState((s) => ({ ...s, shifts: [shift, ...s.shifts] }));
      justOpenedRef.current = { shift, at: Date.now() };
      setShiftReadError(null);
      setDbShift(shift);
      setShiftChecked(true);
      // The lock screen keys off the store in view — make sure it is the
      // terminal's branch so the guard clears the instant the shift is stored.
      if (storeId !== stateRef.current.currentStoreId) {
        setState((s) => ({ ...s, currentStoreId: storeId }));
      }
      return target;
    },
    [user, terminalUser, authUserId],
  );

  const closeShift = useCallback(
    async (
      countedCash: number,
      note: string,
      extras: Partial<Shift> = {},
    ) => {
      if (!activeShift) return null;
      // Only the PC that opened the shift may close it — unless a manager or
      // admin is signed in, who can close from anywhere.
      const here = readTerminalConfig()?.tokenId ?? localTerminalId();
      const sameTerminal = !activeShift.terminalId || activeShift.terminalId === here;
      if (!sameTerminal && !isAdmin && !isSupervisor) return null;
      const closed: Shift = {
        ...activeShift,
        ...extras,
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
      justOpenedRef.current = null;
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
      recordActivity({
        type: "shift_close",
        severity: closed.overdue ? "warning" : "info",
        title: "Shift closed",
        message: `${closed.closedBy ?? closed.cashier} closed the shift with ${countedCash} counted.`,
        actorName: closed.closedBy ?? closed.cashier,
        actorRole: closed.closedByRole ?? null,
        terminalId: closed.terminalId ?? null,
        terminalName: closed.terminalName ?? null,
        storeId: closed.storeId,
        entityType: "shift",
        entityId: closed.id,
        amount: countedCash,
        meta: { note, overdue: closed.overdue },
      });
      // Day-end summary goes out on whatever channels this device enabled.
      void (async () => {
        const snapshot = stateRef.current;
        const storeName =
          snapshot.stores.find((s) => s.id === closed.storeId)?.name ?? closed.storeId;
        const { buildShiftSummary, dispatchShiftSummary } = await import("./shift-alerts");
        await dispatchShiftSummary(buildShiftSummary(closed, snapshot.sales, storeName)).catch(
          () => null,
        );
      })();
      return closed;
    },
    [activeShift, user, terminalUser, isAdmin, isSupervisor],
  );

  const recordSale = useCallback(async (
    input: Omit<Sale, "id" | "receiptNo" | "createdAt"> & { receiptNo?: string },
  ) => {
    const snapshot = stateRef.current;
    const counter = snapshot.counter + 1;
    // Never write a bill without a branch — the terminal's branch is authoritative.
    const branchId = requireBranchId(input.storeId || snapshot.currentStoreId);
    input = { ...input, storeId: branchId };
    const store = snapshot.stores.find((x) => x.id === branchId);
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
      // Branch + platform + terminal + day + sequence, so two registers can
      // never mint the same bill number, online or off.
      // A number reserved when the ticket started wins, so the header, the
      // held record and the printed bill all agree.
      receiptNo:
        input.receiptNo ||
        nextBillNumber(
          store?.receiptPrefix?.trim() || store?.code || "R",
          snapshot.sales.map((s) => s.receiptNo),
          {
            ...(snapshot.settings.integrations.billNumbering ?? {}),
            timeZone: snapshot.settings.integrations.timeZone || undefined,
          },
        ),
      clientTxnId: input.clientTxnId ?? crypto.randomUUID(),
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
    recordActivity({
      type: "sale_complete",
      title: sale.exchangeOfReceiptNo ? "Exchange bill created" : "Sale completed",
      message: `Bill ${sale.receiptNo} for ${sale.total} paid by ${sale.method}.`,
      actorName: sale.cashier ?? null,
      storeId: sale.storeId,
      entityType: "sale",
      entityId: sale.receiptNo,
      amount: sale.total,
      meta: { lines: sale.lines.length, discount: sale.discount },
    });
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
      tagId: input.tagId,
      intakeNote: input.intakeNote,
      stringOrigin: input.stringOrigin,
      stringProductId: input.stringProductId,
      gripProductId: input.gripProductId,
      charges: input.charges,
      liabilityAccepted: input.liabilityAccepted,
      technician: input.technician,
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

  /** Remove a booking / job card altogether, with the reason on the record. */
  const deleteBooking = useCallback(async (id: string, reason: string) => {
    const current = stateRef.current.bookings.find((b) => b.id === id);
    if (!current) return;
    setState((s) => ({ ...s, bookings: s.bookings.filter((b) => b.id !== id) }));
    logger.log("sale_event", "Booking deleted", "bookings", {
      ref: current.ref,
      reason,
      status: current.status,
      jobStatus: current.jobStatus ?? "received",
      customer: current.customerName,
      total: current.total,
      paid: current.paid,
    });
    await deleteBookingRow(id).catch(() => undefined);
  }, []);

  /** Move a racket through received → strung → ready → collected. */
  const setBookingJobStatus = useCallback((
    id: string,
    status: JobStatus,
    who: string,
    incidentNote?: string,
  ) => {
    const current = stateRef.current.bookings.find((b) => b.id === id);
    if (!current) return null;
    const updated: Booking = {
      ...current,
      jobStatus: status,
      jobStatusBy: who,
      jobStatusAt: new Date().toISOString(),
      ...(incidentNote ? { incidentNote } : {}),
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
      ...(incidentNote ? { incident: incidentNote } : {}),
    });
    return updated;
  }, []);

  /** Rewrite the job card of a booking that has not been collected yet. */
  const updateBookingSpecs = useCallback((id: string, job: RacketJob) => {
    const current = stateRef.current.bookings.find((b) => b.id === id);
    if (!current) return null;
    const updated: Booking = { ...current, job: { ...current.job, ...job } };
    setState((s) => ({ ...s, bookings: s.bookings.map((b) => (b.id === id ? updated : b)) }));
    saveBookingQuietly(updated);
    logger.log("sale_event", "Job card specs edited", "bookings", {
      ref: updated.ref,
      racket: updated.job?.racketModel,
      string: updated.job?.stringType,
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
      const refunded = stateRef.current.sales.find((x) => x.id === saleId);
      recordActivity({
        type: "sale_refund",
        severity: "critical",
        title: "Refund issued",
        message: `Bill ${refunded?.receiptNo ?? saleId} was refunded.`,
        storeId: refunded?.storeId ?? null,
        entityType: "sale",
        entityId: refunded?.receiptNo ?? saleId,
        amount: refunded?.total ?? null,
      });
    }
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

  const upsertProduct = useCallback(async (product: Product): Promise<CommitTarget> => {
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
    // Store it before anything on screen says it was saved.
    const target = await db.commitProduct(record);
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
    return target;
  }, []);

  /**
   * Deletes products that the database will actually let go of.
   *
   * Anything still referenced by past bills or paperwork is kept on screen and
   * returned with the reason, so the caller can explain it to the user.
   */
  const deleteProductIds = useCallback(async (ids: string[], bulk: boolean) => {
    const removed: string[] = [];
    const blocked: BlockedDelete[] = [];
    for (const id of ids) {
      const product = stateRef.current.products.find((p) => p.id === id);
      try {
        await db.deleteProductNow(id);
        removed.push(id);
        logger.log("inventory_edit", "Product deleted", "inventory", {
          productId: id,
          name: product?.name ?? null,
          barcode: product?.barcode ?? null,
          ...(bulk ? { bulk: true } : {}),
        });
      } catch (e) {
        const message = (e as { message?: string })?.message ?? String(e);
        blocked.push({
          id,
          name: product?.name ?? "This product",
          reason: describeDeleteBlock(message),
        });
      }
    }
    if (removed.length) {
      const gone = new Set(removed);
      setState((s) => ({ ...s, products: s.products.filter((p) => !gone.has(p.id)) }));
    }
    return blocked;
  }, []);

  const removeProduct = useCallback(
    (id: string) => deleteProductIds([id], false),
    [deleteProductIds],
  );

  /** Bulk delete from the inventory selection — one trail entry per item. */
  const removeProducts = useCallback(
    (ids: string[]) => deleteProductIds(ids, true),
    [deleteProductIds],
  );

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
   * Takes items off the till and the web catalogue without touching a single
   * record that points at them, so receipts and reports stay exactly as they
   * were rung up.
   */
  const archiveProducts = useCallback(
    (ids: string[]) => patchProducts(ids, { archived: true, ecomVisible: false }),
    [patchProducts],
  );

  /** Brings an archived item back into the catalogue. */
  const restoreProducts = useCallback(
    (ids: string[]) => patchProducts(ids, { archived: false }),
    [patchProducts],
  );

  /**
   * Folds duplicate product records into one master: branch stock is added
   * together and every losing barcode/SKU becomes an alias on the master, so
   * scanning the old code still finds the item.
   */
  const mergeProducts = useCallback(
    async (masterId: string, duplicateIds: string[]): Promise<BlockedDelete[]> => {
    const all = stateRef.current.products;
    const master = all.find((p) => p.id === masterId);
    if (!master) return [];
    const losers = all.filter((p) => duplicateIds.includes(p.id) && p.id !== masterId);
    if (!losers.length) return [];

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
    setState((s) => ({
      ...s,
      products: s.products.map((p) => (p.id === masterId ? merged : p)),
    }));
    return deleteProductIds(
      losers.map((l) => l.id),
      true,
    );
    },
    [deleteProductIds],
  );

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
   * Pull the authoritative quantities back from the database for a handful of
   * products. Called right after receiving stock so the grid and the register
   * show the same number the backend holds, never a stale cached one.
   */
  const syncProducts = useCallback(async (ids: string[]) => {
    const wanted = [...new Set(ids.filter(Boolean))];
    if (!wanted.length) return;
    try {
      const { loadProductsByIds } = await import("./pos-db");
      const fresh = await loadProductsByIds(wanted);
      if (!fresh.length) return;
      const byId = new Map(fresh.map((p) => [p.id, p]));
      setState((s) => ({
        ...s,
        products: s.products.map((p) => byId.get(p.id) ?? p),
      }));
    } catch {
      /* offline — the local figures stay as they are and sync later */
    }
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

  const upsertMember = useCallback(async (member: Member): Promise<CommitTarget> => {
    const prev = stateRef.current.members.find((m) => m.id === member.id);
    logger.log("member_event", prev ? "Member profile edited" : "Member created", "members", {
      memberId: member.id,
      name: member.name,
      phone: member.phone,
      previous: prev ? { points: prev.points, tier: prev.tier, phone: prev.phone } : null,
      updated: { points: member.points, tier: member.tier, phone: member.phone },
      pointsDelta: prev ? member.points - prev.points : member.points,
    });
    const target = await db.commitMember(member);
    setState((s) => ({
      ...s,
      members: s.members.some((m) => m.id === member.id)
        ? s.members.map((m) => (m.id === member.id ? member : m))
        : [member, ...s.members],
    }));
    return target;
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

  const upsertPromotion = useCallback(async (promotion: Promotion): Promise<CommitTarget> => {
    const previous = stateRef.current.promotions.find((p) => p.id === promotion.id);
    logger.log("promotion", previous ? "Promotion updated" : "Promotion created", "promotions", {
      promotionId: promotion.id,
      name: promotion.name,
      active: promotion.active,
    });
    const target = await db.commitPromotion(promotion);
    setState((s) => ({
      ...s,
      promotions: s.promotions.some((p) => p.id === promotion.id)
        ? s.promotions.map((p) => (p.id === promotion.id ? promotion : p))
        : [promotion, ...s.promotions],
    }));
    return target;
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

  const writeGlobalSettings = useCallback((patch: Partial<AppSettings>) => {
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

  /**
   * Route each leaf of the patch to the tier that owns it: a block overridden
   * privately is written privately, then branch, then cluster, otherwise the
   * global record. Locked blocks always fall back to global.
   */
  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      logger.log("settings", "Settings updated", "settings", {
        previous: stateRef.current.settings,
        updated: patch,
      });
      const scope = scopeRef.current;
      const ids = scopeIdsRef.current;
      const byTier = new Map<SettingTier, Map<SettingsSectionId, Record<string, unknown>>>();
      let globalPatch: Record<string, unknown> = {};
      let hasGlobal = false;
      for (const path of patchPaths(patch as Record<string, unknown>)) {
        const value = getPath(patch, path);
        const section = sectionOfPath(path);
        // Strongest tier that already owns this block wins the write.
        const tier =
          section && !scope.locks[section.id]
            ? [...SETTING_TIERS].reverse().find((t) => scope.overrides[t][section.id] && ids[t])
            : undefined;
        if (section && tier) {
          const bag = byTier.get(tier) ?? new Map<SettingsSectionId, Record<string, unknown>>();
          const base = bag.get(section.id) ?? scope.overrides[tier][section.id] ?? {};
          bag.set(section.id, setPath(base, path, value));
          byTier.set(tier, bag);
        } else {
          globalPatch = setPath(globalPatch, path, value);
          hasGlobal = true;
        }
      }
      if (hasGlobal) writeGlobalSettings(globalPatch as Partial<AppSettings>);
      if (!byTier.size) return;
      setScope((s) => {
        const overrides = { ...s.overrides };
        for (const [tier, bag] of byTier) {
          overrides[tier] = { ...overrides[tier], ...Object.fromEntries(bag) };
        }
        return { ...s, overrides };
      });
      for (const [tier, bag] of byTier) {
        for (const [section, sectionPatch] of bag) {
          void saveSectionOverride(tier, ids[tier], section, sectionPatch, whoRef.current).catch(
            (e) => toast.error(`Scoped settings not saved: ${(e as Error).message}`),
          );
        }
      }
    },
    [writeGlobalSettings],
  );
  updateSettingsRef.current = updateSettings;

  /** Start or stop overriding one block at one tier. */
  const setSectionScope = useCallback(
    async (section: SettingsSectionId, on: boolean, tier: SettingTier = "BRANCH", scopeId?: string) => {
      const target = scopeId || scopeIdsRef.current[tier];
      const def = SECTION_BY_ID[section];
      if (!def) return;
      if (!target) {
        toast.error(
          tier === "CLUSTER"
            ? "This branch is not part of a cluster yet."
            : "No scope is available for this terminal.",
        );
        return;
      }
      if (scopeRef.current.locks[section] && on) {
        toast.error("This block is locked by head office.");
        return;
      }
      if (on) {
        const patch = pickSection(stateRef.current.settings, def);
        setScope((s) => ({
          ...s,
          overrides: { ...s.overrides, [tier]: { ...s.overrides[tier], [section]: patch } },
        }));
        await saveSectionOverride(tier, target, section, patch, whoRef.current);
      } else {
        setScope((s) => {
          const tierBag = { ...s.overrides[tier] };
          delete tierBag[section];
          return { ...s, overrides: { ...s.overrides, [tier]: tierBag } };
        });
        await clearSectionOverride(tier, target, section);
      }
      logger.log("settings", on ? "Scope override enabled" : "Override removed", "settings", {
        section,
        tier,
        scopeId: target,
      });
    },
    [],
  );

  const setSectionLocked = useCallback(async (section: SettingsSectionId, locked: boolean) => {
    setScope((s) => ({ ...s, locks: { ...s.locks, [section]: locked } }));
    await setSectionLock(section, locked, whoRef.current);
    logger.log("settings", locked ? "Setting locked globally" : "Setting unlocked", "settings", {
      section,
    });
  }, []);

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
    void receiveTransferInDb(id, actorRef.current).then((r) => {
      if (!r.success) dbError("Receiving transfer", new Error(r.error ?? "Unknown error"));
    });
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

  const reset = useCallback(() => setState(emptyState), []);

  // Every consumer sees the resolved record:
  // Private > Branch > Cluster > Global > shipped default.
  const effectiveState = useMemo(() => {
    let settings = state.settings;
    let touched = false;
    for (const tier of SETTING_TIERS) {
      for (const key of Object.keys(scope.overrides[tier]) as SettingsSectionId[]) {
        if (scope.locks[key]) continue;
        settings = mergePatch(settings, scope.overrides[tier][key]);
        touched = true;
      }
    }
    if (!touched) return state;
    return { ...state, settings };
  }, [state, scope]);

  /** Which tier is supplying the value at a dotted settings path right now. */
  const sourceOfPath = useCallback(
    (path: string): SettingSource => {
      const section = sectionOfPath(path);
      if (!section || scope.locks[section.id]) return "GLOBAL";
      for (const tier of [...SETTING_TIERS].reverse()) {
        const patch = scope.overrides[tier][section.id];
        if (patch && getPath(patch, path) !== undefined) return tier;
      }
      return "GLOBAL";
    },
    [scope],
  );

  const value: Ctx = {
    ready,
    state: effectiveState,
    settingsScope: scope,
    scopeIds,
    sourceOfPath,
    setSectionScope,
    setSectionLocked,
    stores: state.stores,
    currentStore,
    setCurrentStore,
    upsertStore,
    removeStore,
    activeShift,
    shiftReadError,
    shiftChecked,
    openShift,
    closeShift,
    recordSale,
    refundSale,
    changeSalePayment,
    createBooking,
    addBookingPayment,
    collectBooking,
    cancelBooking,
    deleteBooking,
    setBookingJobStatus,
    updateBookingSpecs,
    upsertProduct,
    removeProduct,
    syncProducts,
    removeProducts,
    patchProducts,
    archiveProducts,
    restoreProducts,
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

/**
 * Same as usePos, but returns null instead of throwing when the provider is
 * not mounted yet. Use in shell-level components that must never blank the app.
 */
export function usePosOptional() {
  return useContext(PosContext);
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
