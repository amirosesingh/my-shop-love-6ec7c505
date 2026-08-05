import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  CreditCard,
  Minus,
  Plus,
  Printer,
  Search,
  Trash2,
  Wallet,
  Gift,
  Vault,
  Info,
  UserPlus,
  X,
  Repeat,
  Sparkles,
  History,
  CalendarClock,
  ChevronUp,
  MonitorPlay,
  Landmark,
  MessageCircle,
  PauseCircle,
  Percent,
  TicketPercent,
  Split,
  Wrench,
  ChefHat,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/AppShell";
import { ActionButton } from "@/components/pos/ActionButton";
import { CatalogPanel } from "@/components/pos/CatalogPanel";
import { ScanBar } from "@/components/pos/ScanBar";
import { setTicketDirty } from "@/lib/desktop-window";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { availableAt, cartTotals, money, stockAt, usePos } from "@/lib/pos-store";
import { useAuth } from "@/lib/pos-auth";
import { productVisibleAt } from "@/lib/branch-policy";
import { ThemedSelect } from "@/components/pos/ThemedSelect";
import { BOOKING_TIMING_LABELS, type BookingPaymentTiming } from "@/lib/pos-types";
import { useUserPermissions } from "@/lib/pos-permissions";
import { useVisibility } from "@/lib/ui-visibility";
import { useUiScale } from "@/lib/use-ui-scale";
import { removeHeldOrder, setHeldOrders, useHeldOrders, type HeldOrder } from "@/lib/held-orders";
import { TICKET_ACTIONS, logTicketEvent } from "@/lib/ticket-audit";
import {
  discountLabel,
  loadMemberVouchers,
  loadVoucherByToken,
  redeemVoucher,
  scopeLabel,
  voucherValue,
} from "@/lib/coupons";
import type { Campaign, VoucherView } from "@/lib/coupons";
import type { CartLine, DiscountType, PaymentMethod, Sale } from "@/lib/pos-types";
import type { Payment } from "@/lib/pos-types";
import { TenderSplit, rememberBanks } from "@/components/pos/TenderSplit";
import {
  lineUnitDiscount,
  paymentsLabel,
  paymentsTotal,
  PAYMENT_LABELS,
  r2,
  validateTenders,
} from "@/lib/pos-types";
import { NO_SALE_REASON_MAX, NO_SALE_REASON_MIN, recordNoSale } from "@/lib/drawer-events";
import { buildBookingMessage, buildSaleMessage, sendBillOnWhatsApp } from "@/lib/whatsapp";
import { logger } from "@/lib/audit-log";
import { DiscountPad } from "@/components/pos/DiscountPad";
import { evaluatePromotions, focLine } from "@/lib/pos-promotions";
import { clearCartDraft, loadCartDraft, saveCartDraft } from "@/lib/cart-draft";
import {
  openCashDrawer,
  printBookingSlip,
  printJobTag,
  printSaleReceipt,
  saleReceiptPreview,
} from "@/lib/pos-print";
import {
  openCustomerDisplay,
  publishDisplay,
  toDisplayLine,
  type DisplaySnapshot,
} from "@/lib/customer-display";
import { MemberHistoryDialog } from "@/components/pos/MemberHistoryDialog";

const isoDaysFromNow = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { resume?: string } =>
    typeof search['resume'] === "string" ? { resume: search['resume'] as string } : {},
  head: () => ({
    meta: [
      { title: "Register — Northwind POS" },
      {
        name: "description",
        content:
          "Ring up sales, attach members, take cash or card payments, open the drawer and print thermal receipts.",
      },
      { property: "og:title", content: "Register — Northwind POS" },
      { property: "og:description", content: "Fast touch checkout with receipts and members." },
    ],
  }),
  component: Register,
});

function Register() {
  const { state, activeShift, recordSale, createBooking, openShift, closeShift, currentStore } =
    usePos();
  useUiScale();
  const { user, can } = useAuth();
  const { requirePermission } = useUserPermissions();
  const { visible } = useVisibility();
  const [closeShiftOpen, setCloseShiftOpen] = useState(false);
  const [countedCash, setCountedCash] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const canDiscount = can("can_give_discount");
  const [discountOverride, setDiscountOverride] = useState(false);
  const discountAllowed = canDiscount || discountOverride;
  async function unlockDiscounts() {
    if (discountAllowed) return true;
    const ok = await requirePermission("can_give_discount");
    if (ok) setDiscountOverride(true);
    return ok;
  }
  const canRefund = can("can_process_refund");
  const [query, setQuery] = useState("");
  /** Narrow-window product browser. */
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [category, setCategory] = useState("All");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [cartDiscount, setCartDiscount] = useState(0);
  const [cartDiscountType, setCartDiscountType] = useState<DiscountType>("amount");
  /** Calculator-style discount pad: index of the cart line, or "bill". */
  const [padTarget, setPadTarget] = useState<number | "bill" | null>(null);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [billQuery, setBillQuery] = useState("");
  const [billHit, setBillHit] = useState<Sale | null>(null);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [exchangeRef, setExchangeRef] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [openShiftOpen, setOpenShiftOpen] = useState(false);
  const [float, setFloat] = useState("150");
  const [cashier, setCashier] = useState(user?.name ?? "Cashier");
  /** Who is actually signed in right now — sales are stamped with this, not
   *  the name captured when the shift was opened (users may switch mid-shift). */
  const activeCashier = user?.name || activeShift?.cashier || cashier;
  /** No open shift = the whole till is frozen, for every role including
   *  supervisors: no coupons, exchanges, drawer opens, prints or payments. */
  const tillLocked = !activeShift;
  const lockedReason = "Open a shift first";
  const [tendered, setTendered] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [transferRef, setTransferRef] = useState("");
  const [waNumber, setWaNumber] = useState("");
  const [waSending, setWaSending] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const [historyMemberId, setHistoryMemberId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [bookOpen, setBookOpen] = useState(false);
  const [deposit, setDeposit] = useState("");
  const [depositMethod, setDepositMethod] = useState<PaymentMethod>("cash");
  const [dueDate, setDueDate] = useState(isoDaysFromNow(14));
  const [bookName, setBookName] = useState("");
  const [bookPhone, setBookPhone] = useState("");
  const [bookNote, setBookNote] = useState("");
  // What the booking is for (re-stringing, repair …) and when it gets paid.
  const [serviceId, setServiceId] = useState("");
  const [customService, setCustomService] = useState("");
  const [serviceFee, setServiceFee] = useState("");
  const [payTiming, setPayTiming] = useState<BookingPaymentTiming>("deposit");
  /* Racket stringing job card */
  /** Which flow opened the booking dialog: goods booking vs racket job. */
  const [bookMode, setBookMode] = useState<"cart" | "racket">("cart");
  const [racketModel, setRacketModel] = useState("");
  const [stringType, setStringType] = useState("");
  const [tensionMain, setTensionMain] = useState("");
  const [tensionCross, setTensionCross] = useState("");
  const [tensionUnit, setTensionUnit] = useState<"lb" | "kg">("lb");
  const [grommetNotes, setGrommetNotes] = useState("");
  const [jobNotes, setJobNotes] = useState("");
  const [promisedAt, setPromisedAt] = useState("");
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(false);
  /** Narrow windows: the action deck collapses so it can't cover the totals. */
  const [deckOpen, setDeckOpen] = useState(false);
  /* Operation deck state */
  const held = useHeldOrders();
  const [receiptPreview, setReceiptPreview] = useState(false);
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponScope, setCouponScope] = useState<"bill" | "item">("bill");
  const [couponLine, setCouponLine] = useState<string>("");
  const [coupon, setCoupon] = useState<{
    code: string;
    promoId: string;
    scope: "bill" | "item";
    discount: number;
    productId?: string;
    productName?: string;
    appliedAt: string;
    /** campaign title, printed on the slip */
    name?: string;
    /** unused value left on a fixed-amount voucher */
    remaining?: number;
  } | null>(null);
  /** Digital voucher token locked at the end of the sale, when one is on the bill. */
  const [voucherToken, setVoucherToken] = useState<string | null>(null);
  /** Live vouchers held by the attached member, for the picker. */
  const [memberVouchers, setMemberVouchers] = useState<VoucherView[]>([]);
  const [voucherPickerOpen, setVoucherPickerOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitWays, setSplitWays] = useState(2);
  /* Split tenders + card machine capture */
  const [tenders, setTenders] = useState<Payment[]>([]);
  const [bankName, setBankName] = useState("");
  /* No-sale drawer open */
  const [noSaleOpen, setNoSaleOpen] = useState(false);
  const [noSaleReason, setNoSaleReason] = useState("");
  const [noSaleNote, setNoSaleNote] = useState("");

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(state.products.map((p) => p.category)))],
    [state.products],
  );

  const filtered = state.products.filter((p) => {
    if (!productVisibleAt(state.settings, p.id, state.currentStoreId)) return false;
    const q = query.trim().toLowerCase();
    const match =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.barcode.includes(q);
    return match && (category === "All" || p.category === category);
  });

  const member = state.members.find((m) => m.id === memberId) ?? null;

  /* ── Sticky ticket ──────────────────────────────────────────────────────
     The open ticket is stored per store so a refresh, a trip to another page
     or an app restart never silently drops what the cashier rang up. It is
     only cleared by Clear/Void, a completed payment, or holding/booking. */
  const draftStore = currentStore.id;
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (hydratedFor.current === draftStore) return;
    if (!state.products.length) return; // wait for the catalogue before validating
    hydratedFor.current = draftStore;
    const draft = loadCartDraft(draftStore);
    if (!draft) return;
    const known = new Set(state.products.map((p) => p.id));
    const kept = draft.lines.filter((l) => known.has(l.productId));
    setLines(kept);
    setCartDiscount(draft.cartDiscount);
    setCartDiscountType(draft.cartDiscountType);
    setExchangeRef(draft.exchangeRef);
    setMemberId(draft.memberId);
    setCoupon((draft.coupon as typeof coupon) ?? null);
    if (kept.length < draft.lines.length)
      toast.info("Some items on the saved ticket are no longer in the catalogue");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStore, state.products.length]);

  useEffect(() => {
    if (hydratedFor.current !== draftStore) return;
    saveCartDraft(draftStore, {
      lines,
      cartDiscount,
      cartDiscountType,
      exchangeRef,
      memberId,
      coupon,
    });
  }, [draftStore, lines, cartDiscount, cartDiscountType, exchangeRef, memberId, coupon]);

  // Keep the attached member's live vouchers loaded for the picker.
  useEffect(() => {
    if (!memberId) {
      setMemberVouchers([]);
      return;
    }
    let live = true;
    void loadMemberVouchers(memberId)
      .then((vs) => live && setMemberVouchers(vs))
      .catch(() => live && setMemberVouchers([]));
    return () => {
      live = false;
    };
  }, [memberId]);

  const taxSettings = state.settings.tax;
  // Promotions run against the subtotal after line-level discounts.
  const preTotals = cartTotals(lines, 0, "amount", taxSettings);
  const promoBase = r2(preTotals.subtotal - preTotals.lineDiscount);
  const promo = evaluatePromotions({
    promotions: state.promotions,
    products: state.products,
    base: promoBase,
    member,
  });
  const manualBillDiscount = r2(
    cartDiscountType === "percent" ? (promoBase * (cartDiscount || 0)) / 100 : cartDiscount || 0,
  );
  const totals = cartTotals(
    lines,
    r2(manualBillDiscount + promo.promoDiscount),
    "amount",
    taxSettings,
  );
  const pointsEarned = member ? Math.max(0, Math.round(totals.total * promo.pointsRate)) : 0;

  // Keep the qualifying FOC freebie in sync with the open ticket.
  const focId = promo.foc ? `${promo.foc.promo.id}:${promo.foc.product.id}:${promo.foc.qty}` : "";
  const hasFoc = lines.some((l) => l.foc);
  // The desktop close button warns when a ticket is still open.
  useEffect(() => {
    setTicketDirty(lines.length > 0);
    return () => setTicketDirty(false);
  }, [lines.length]);
  useEffect(() => {
    if (focId && !hasFoc) {
      const [, productId, qty] = focId.split(":");
      const rule = state.promotions.find((p) => p.id === focId.split(":")[0]);
      const product = state.products.find((p) => p.id === productId);
      if (rule && product) setLines((ls) => [...ls, focLine(rule, product, Number(qty))]);
    }
    if (!focId && hasFoc) setLines((ls) => ls.filter((l) => !l.foc));
  }, [focId, hasFoc, state.promotions, state.products]);
  const balanceDue = totals.total >= 0 ? totals.total : 0;
  const refundDue = totals.total < 0 ? r2(-totals.total) : 0;
  const detail = state.products.find((p) => p.id === detailId) ?? null;

  const memberMatches = memberQuery.trim()
    ? state.members
        .filter((m) => {
          const q = memberQuery.trim().toLowerCase();
          return (
            m.name.toLowerCase().includes(q) ||
            m.phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")) ||
            m.code.toLowerCase().includes(q)
          );
        })
        .slice(0, 5)
    : [];

  function addLine(productId: string) {
    if (!activeShift) {
      toast.error("Open a shift before ringing up a sale");
      setOpenShiftOpen(true);
      return;
    }
    const product = state.products.find((p) => p.id === productId);
    if (!product) return;
    const onHand = availableAt(product, currentStore.id, state.bookings);
    if (onHand <= 0) {
      const reserved = stockAt(product, currentStore.id) > 0;
      toast.error(
        reserved
          ? `${product.name} is fully reserved by open bookings at ${currentStore.name}`
          : `${product.name} is out of stock at ${currentStore.name}`,
      );
      return;
    }
    setLines((ls) => {
      const found = ls.find((l) => l.productId === productId && !l.credit);
      if (found)
        return ls.map((l) =>
          l.productId === productId && !l.credit ? { ...l, qty: l.qty + 1 } : l,
        );
      return [
        ...ls,
        {
          productId,
          name: product.name,
          price: product.price,
          qty: 1,
          taxRate: product.taxRate,
          discount: 0,
          discountType: "amount",
        },
      ];
    });
  }

  async function setQty(index: number, delta: number) {
    const line = lines[index];
    const removes = line && !line.credit && line.qty + delta <= 0;
    // Removing a line, or reducing a quantity, needs manager approval unless
    // the cashier holds the right themselves.
    if (removes) {
      if (!(await requirePermission("can_delete_line"))) return;
      logger.log("refund", "Line deleted from the cart", "register", {
        product: line?.name,
        productId: line?.productId,
        qty: line?.qty,
        price: line?.price,
        storeId: currentStore.id,
      });
    } else if (delta < 0 && line && !line.credit) {
      if (!(await requirePermission("can_reduce_qty"))) return;
      logger.log("sale", "Item quantity reduced", "register", {
        product: line.name,
        productId: line.productId,
        from: line.qty,
        to: line.qty - 1,
        storeId: currentStore.id,
      });
    }
    setLines((ls) =>
      ls
        .map((l, i) => (i === index ? { ...l, qty: l.credit ? l.qty - delta : l.qty + delta } : l))
        .filter((l) => (l.credit ? l.qty < 0 : l.qty > 0)),
    );
  }

  function patchLine(index: number, patch: Partial<CartLine>) {
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function resetCart() {
    setLines([]);
    setCartDiscount(0);
    setExchangeRef(null);
    setCoupon(null);
    clearCartDraft(currentStore.id);
  }

  async function clearCart(source: "clear" | "void" = "void") {
    if (lines.length && !(await requirePermission("can_void_cart"))) return;
    if (lines.length) {
      logTicketEvent(source === "clear" ? TICKET_ACTIONS.cleared : TICKET_ACTIONS.voided, {
        lines: lines.length,
        value: totals.total,
        coupon: coupon?.code ?? null,
        storeId: currentStore.id,
        member: member?.name ?? null,
        items: lines.map((l) => ({ name: l.name, qty: l.qty, price: l.price })),
      });
    }
    resetCart();
  }

  function lookupBill() {
    const ref = billQuery.trim().toLowerCase();
    const hit =
      state.sales.find((s) => s.receiptNo.toLowerCase() === ref) ??
      state.sales.find((s) => s.receiptNo.toLowerCase().includes(ref) && !!ref) ??
      null;
    setBillHit(hit);
    setPicks({});
    if (!hit) toast.error(`No bill found for “${billQuery}”`);
  }

  function addExchangeCredits() {
    if (!billHit) return;
    if (!activeShift) {
      toast.error("Open a shift before processing an exchange");
      return;
    }
    const credits: CartLine[] = Object.entries(picks)
      .filter(([, qty]) => qty > 0)
      .map(([idx, qty]) => {
        const src = billHit.lines[Number(idx)];
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

  /** Adds the product matching a scanned/typed code to the ticket. */
  function scanCode(raw: string) {
    const code = raw.trim();
    if (!code) return;
    // Customer vouchers arrive as a token or as the full redeem.* URL.
    if (/(^|\/)vch_[a-z0-9]+$/i.test(code)) {
      void applyVoucher(code);
      return;
    }
    if (!activeShift) {
      toast.error("Open a shift before ringing up a sale");
      setOpenShiftOpen(true);
      return;
    }
    const hit = state.products.find(
      (p) => p.barcode === code || p.sku.toLowerCase() === code.toLowerCase(),
    );
    if (!hit) {
      toast.error(`No product matches “${code}”`);
      return;
    }
    addLine(hit.id);
  }

  function scanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = query.trim();
    if (!code) return;
    if (/(^|\/)vch_[a-z0-9]+$/i.test(code)) {
      setQuery("");
      void applyVoucher(code);
      return;
    }
    const hit = state.products.find(
      (p) => p.barcode === code || p.sku.toLowerCase() === code.toLowerCase(),
    );
    if (hit) setQuery("");
    scanCode(code);
  }

  const displayBase = {
    companyName: state.settings.receipt.companyName || currentStore.name,
    storeName: `${currentStore.name} (${currentStore.code})`,
    cashier: activeCashier,
    payment: state.settings.payment,
  };

  const cartSnapshot = (): DisplaySnapshot => ({
    at: Date.now(),
    ...displayBase,
    mode: lines.length ? "cart" : "idle",
    memberName: member?.name ?? null,
    memberPoints: member?.points ?? null,
    lines: lines.map((l) => toDisplayLine(l, r2((l.price - lineUnitDiscount(l)) * l.qty))),
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total,
    paid: 0,
    change: 0,
    balance: 0,
    reference: "",
    dueDate: "",
    promos: promo.applied.map((a) => `${a.name} · ${a.detail}`),
    method: null,
    transferRef: "",
  });

  // Mirror the live ticket onto the customer-facing second screen.
  const displayKey = JSON.stringify({
    l: lines.map((l) => [l.productId, l.qty, l.discount, l.discountType, l.foc, l.credit]),
    t: totals.total,
    d: totals.discount,
    x: totals.tax,
    m: member?.id ?? null,
    s: currentStore.id,
  });
  useEffect(() => {
    publishDisplay(cartSnapshot());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayKey, state.settings.payment]);

  /** Show bank-transfer instructions on the customer screen while the
   *  cashier has that tender selected. */
  useEffect(() => {
    if (!payOpen) return;
    publishDisplay({
      ...cartSnapshot(),
      mode: method === "bank_transfer" ? "transfer" : "cart",
      method,
      transferRef,
      balance: totals.total,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payOpen, method, transferRef, displayKey]);

  const wa = state.settings.whatsapp;

  /** Sends the finished bill to the customer's WhatsApp. */
  async function sendSaleOnWhatsApp(sale: Sale, to: string) {
    setWaSending(true);
    const buyer = state.members.find((m) => m.id === sale.memberId) ?? null;
    const res = await sendBillOnWhatsApp({
      cfg: wa,
      to,
      body: buildSaleMessage(sale, displayBase.companyName, wa),
      reference: sale.receiptNo,
      member: buyer,
    });
    setWaSending(false);
    if (res.ok) toast.success(`Bill ${sale.receiptNo} sent on WhatsApp`);
    else toast.error("WhatsApp send failed", { description: res.error });
  }

  const serviceTypes = (state.settings.integrations.serviceTypes ?? []).filter(
    (s2) => s2.active && s2.name.trim(),
  );
  const useServices = !!state.settings.integrations.useServiceTypes;
  const pickedService = serviceTypes.find((s2) => s2.id === serviceId) ?? null;
  const stringingService = serviceTypes.find((s2) => s2.isStringingJob) ?? null;
  /** Goods bookings never offer stringing work — that is the racket flow. */
  const cartServiceTypes = serviceTypes.filter((s2) => !s2.isStringingJob);
  const racketMode = bookMode === "racket";

  function resetJobCard() {
    setRacketModel("");
    setStringType("");
    setTensionMain("");
    setTensionCross("");
    setTensionUnit("lb");
    setGrommetNotes("");
    setJobNotes("");
    setPromisedAt("");
    setNotifyWhatsApp(false);
  }

  /** Racket / stringing job started from the products card — cart independent. */
  function startRacketBooking() {
    if (!activeShift) {
      toast.error("Open a shift before taking a booking");
      return;
    }
    setDeposit("");
    setBookName(member?.name ?? "");
    setBookPhone(member?.phone ?? "");
    if (stringingService) {
      setServiceId(stringingService.id);
      setServiceFee(stringingService.fee ? String(stringingService.fee) : "");
    }
    setBookMode("racket");
    setBookOpen(true);
  }
  const serviceLabel = pickedService?.name ?? customService.trim();
  const serviceCharge =
    useServices || racketMode ? r2(Math.max(0, Number(serviceFee || 0))) : 0;
  const bookingTotal = r2(totals.total + serviceCharge);

  async function bookAndPayLater() {
    if (!activeShift) {
      toast.error("Open a shift before taking a booking");
      return;
    }
    if (!racketMode && !lines.length) {
      toast.error("Add at least one item to the cart before booking", {
        description: "Only racket / stringing jobs can be booked with an empty cart.",
      });
      return;
    }
    if (!(await requirePermission("can_process_sale"))) return;
    const paidNow =
      payTiming === "collection"
        ? 0
        : payTiming === "now"
          ? bookingTotal
          : r2(Math.max(0, Number(deposit || 0)));
    if (paidNow > bookingTotal) {
      toast.error("Deposit cannot exceed the booking total");
      return;
    }
    if (!dueDate) {
      toast.error("Choose a collect-by date");
      return;
    }
    let booking: Booking;
    try {
      setSaving(true);
      booking = await createBooking({
      storeId: currentStore.id,
      shiftId: activeShift.id,
      lines,
      subtotal: r2(totals.subtotal + serviceCharge),
      discount: totals.discount,
      tax: totals.tax,
      total: bookingTotal,
      serviceTypeId: pickedService?.id,
      serviceName: serviceLabel || undefined,
      serviceFee: serviceCharge || undefined,
      paymentTiming: payTiming,
      deposit: paidNow,
      depositMethod,
      dueDate,
      memberId,
      customerName: bookName.trim() || member?.name || "Walk-in",
      customerPhone: bookPhone.trim() || member?.phone || "",
      note: bookNote.trim(),
      cashier: activeCashier,
      job: racketMode
        ? {
            racketModel: racketModel.trim() || undefined,
            stringType: stringType.trim() || undefined,
            tensionMain: tensionMain ? Number(tensionMain) : undefined,
            tensionCross: tensionCross ? Number(tensionCross) : undefined,
            tensionUnit,
            grommetNotes: grommetNotes.trim() || undefined,
            jobNotes: jobNotes.trim() || undefined,
            droppedOffAt: new Date().toISOString(),
            promisedAt: promisedAt ? new Date(promisedAt).toISOString() : undefined,
            notifyWhatsApp,
          }
        : undefined,
      });
    } catch (e) {
      toast.error("Booking was not saved", {
        description: (e as { message?: string })?.message ?? "Nothing was stored — try again.",
      });
      return;
    } finally {
      setSaving(false);
    }
    if (paidNow > 0 && depositMethod === "cash") openCashDrawer();
    printBookingSlip(booking, member, state.settings.payment);
    if (booking.job) printJobTag(booking);
    if (wa.enabled && wa.autoSendOnBooking) {
      void sendBillOnWhatsApp({
        cfg: wa,
        to: bookPhone.trim() || member?.phone || "",
        body: buildBookingMessage(booking, displayBase.companyName, wa),
        reference: booking.ref,
        member,
      });
    }
    publishDisplay({
      ...cartSnapshot(),
      mode: "booking",
      paid: booking.paid,
      balance: r2(booking.total - booking.paid),
      reference: booking.ref,
      dueDate: booking.dueDate,
      method: depositMethod,
    });
    resetCart();
    setMemberId(null);
    setBookOpen(false);
    setDeposit("");
    setBookName("");
    setBookPhone("");
    setBookNote("");
    setServiceId("");
    setCustomService("");
    setServiceFee("");
    resetJobCard();
    setBookMode("cart");
    setPayTiming("deposit");
    setDueDate(isoDaysFromNow(14));
    toast.success(`Booking ${booking.ref} reserved until ${new Date(booking.dueDate).toDateString()}`);
  }

  async function completeSale() {
    if (!activeShift) {
      toast.error("Open a shift before taking payment");
      return;
    }
    const isRefund = totals.total < 0;
    if (!(await requirePermission("can_process_sale"))) return;
    if (isRefund && !(await requirePermission("can_process_refund"))) return;
    const splitting = tenders.length > 0;
    const split = validateTenders(totals.total, tenders);
    const splitPaid = split.paid;
    if (!isRefund && splitting && split.error) {
      toast.error(
        split.balance > 0
          ? `Split tenders cover ${money(splitPaid)} of ${money(totals.total)} — ${split.error}`
          : split.error,
      );
      return;
    }
    const paid = isRefund
      ? totals.total
      : splitting
        ? splitPaid
        : method === "cash"
          ? Number(tendered || 0)
          : totals.total;
    if (!isRefund && !splitting && method === "cash" && paid < totals.total) {
      toast.error("Tendered amount is less than the total");
      return;
    }
    if (!isRefund && !splitting && method === "card" && !bankName.trim()) {
      toast.error("Enter which bank card machine was used");
      return;
    }
    if (!isRefund && !splitting && method === "bank_transfer" && !transferRef.trim()) {
      toast.error("Enter the transfer reference shown on the customer's slip");
      return;
    }
    if (!isRefund && !splitting && method === "points" && (member?.points ?? 0) < totals.total * 100) {
      toast.error("Not enough points on this member");
      return;
    }
    const payments: Payment[] = splitting
      ? tenders
      : [
          {
            id: crypto.randomUUID(),
            method,
            amount: r2(Math.abs(totals.total)),
            ...(method === "card" && bankName.trim() ? { bankName: bankName.trim() } : {}),
            ...(method === "bank_transfer" && transferRef.trim()
              ? { ref: transferRef.trim() }
              : {}),
          },
        ];
    // The headline method stays the largest tender so reports keep working.
    const headline = payments.reduce((a, p) => (p.amount > a.amount ? p : a), payments[0]!).method;
    rememberBanks(payments.map((p) => p.bankName ?? ""));
    const sale = recordSale({
      storeId: currentStore.id,
      shiftId: activeShift.id,
      lines,
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      total: totals.total,
      paid,
      change: r2(Math.max(0, paid - totals.total)),
      method: splitting ? headline : method,
      payments,
      memberId,
      pointsEarned,
      cashier: activeCashier,
      ...(method === "bank_transfer" ? { transferRef: transferRef.trim() } : {}),
      ...(exchangeRef
        ? { exchangeOfReceiptNo: exchangeRef, exchangeCredit: totals.credit }
        : {}),
      ...(coupon
        ? {
            couponCode: coupon.code,
            couponPromoId: coupon.promoId,
            couponScope: coupon.scope,
            couponDiscount: coupon.discount,
            couponName: coupon.name,
            couponRemaining: coupon.remaining,
          }
        : {}),
    });
    if (coupon) {
      logger.log("promotion", "Coupon redeemed on a bill", "register", {
        receiptNo: sale.receiptNo,
        coupon: coupon.code,
        promotionId: coupon.promoId,
        scope: coupon.scope,
        product: coupon.productName ?? null,
        discountValue: coupon.discount,
        billTotal: sale.total,
        storeId: sale.storeId,
      });
    }
    if (payments.some((p) => p.method === "cash")) openCashDrawer();
    if (voucherToken) {
      // Single-use lock lives in the database, so a second scan cannot reuse it.
      void redeemVoucher({
        token: voucherToken,
        saleId: sale.receiptNo,
        storeId: sale.storeId,
        staff: activeCashier,
      }).catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Could not lock the voucher"),
      );
      setVoucherToken(null);
    }
    if (splitting || payments.some((p) => p.bankName)) {
      logger.log("sale", "Split payment recorded", "register", {
        receiptNo: sale.receiptNo,
        total: sale.total,
        tenders: paymentsLabel(payments),
        storeId: sale.storeId,
      });
    }
    if (method === "bank_transfer") {
      logger.log("sale", "Bank transfer payment recorded", "register", {
        receiptNo: sale.receiptNo,
        total: sale.total,
        transferRef: sale.transferRef,
        bank: state.settings.payment.bankName,
      });
    }
    printSaleReceipt(sale, member, "sale");
    setLastSale(sale);
    const customerNumber = member?.phone ?? "";
    setWaNumber(customerNumber);
    if (wa.enabled && wa.autoSendOnSale && customerNumber) {
      void sendSaleOnWhatsApp(sale, customerNumber);
    }
    publishDisplay({
      ...cartSnapshot(),
      mode: "paid",
      paid: sale.paid,
      change: sale.change,
      reference: sale.receiptNo,
      method: sale.method,
      transferRef: sale.transferRef ?? "",
    });
    resetCart();
    setMemberId(null);
    setTendered("");
    setTransferRef("");
    setTenders([]);
    setBankName("");
    setPayOpen(false);
    toast.success(
      exchangeRef
        ? `Exchange ${sale.receiptNo} completed against ${exchangeRef}`
        : `Sale ${sale.receiptNo} completed`,
    );
  }

  /* ── Operation deck helpers ─────────────────────────────────────── */

  function openPayment(preset?: PaymentMethod) {
    if (!lines.length) return;
    if (preset) setMethod(preset);
    setTendered(Math.max(0, totals.total).toFixed(2));
    setPayOpen(true);
  }

  /** Park the open ticket with everything on it, so reopening is lossless. */
  function holdOrder(silent = false) {
    if (!lines.length) return null;
    const snapshot = lines;
    const id = `H${Date.now()}`;
    const order: HeldOrder = {
      id,
      label: `${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${snapshot.length} item(s)`,
      total: totals.total,
      lines: snapshot,
      heldAt: new Date().toISOString(),
      storeId: currentStore.id,
      heldBy: activeCashier,
      cartDiscount,
      cartDiscountType,
      exchangeRef,
      memberId,
      memberName: member?.name ?? null,
      coupon,
    };
    setHeldOrders((hs) => [...hs, order]);
    logTicketEvent(TICKET_ACTIONS.held, {
      holdRef: id,
      lines: snapshot.length,
      value: totals.total,
      storeId: currentStore.id,
      memberId,
      member: member?.name ?? null,
      items: snapshot.map((l) => ({ name: l.name, qty: l.qty, price: l.price })),
    });
    resetCart();
    if (!silent) toast.success("Order held — reopen it from Hold tickets");
    return order;
  }

  /** Reopen a parked ticket. An open ticket is parked first, so the cashier
   *  can switch between drafts without losing either one. */
  function resumeHeld(id: string) {
    const order = held.find((h) => h.id === id);
    if (!order) return;
    const parked = lines.length ? holdOrder(true) : null;
    setLines(order.lines);
    setCartDiscount(order.cartDiscount ?? 0);
    setCartDiscountType(order.cartDiscountType ?? "amount");
    setExchangeRef(order.exchangeRef ?? null);
    setMemberId(order.memberId ?? null);
    setCoupon((order.coupon as typeof coupon) ?? null);
    removeHeldOrder(id);
    logTicketEvent(parked ? TICKET_ACTIONS.switched : TICKET_ACTIONS.resumed, {
      holdRef: order.id,
      parkedRef: parked?.id ?? null,
      lines: order.lines.length,
      value: order.total,
      heldAt: order.heldAt,
      heldBy: order.heldBy ?? null,
      heldForSeconds: Math.round((Date.now() - new Date(order.heldAt).getTime()) / 1000),
      storeId: currentStore.id,
    });
    toast.success(parked ? "Switched ticket — the previous one is on hold" : "Held order resumed");
  }

  /** Arriving from the Hold tickets screen with ?resume=<id>. */
  const { resume } = Route.useSearch();
  const navigate = useNavigate();
  useEffect(() => {
    if (!resume) return;
    resumeHeld(resume);
    void navigate({ to: "/", search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume]);

  async function applyCoupon() {
    const code = couponCode.trim();
    if (!code) return;
    const rule = state.promotions.find(
      (p) => p.active && p.name.toLowerCase() === code.toLowerCase() && p.value,
    );
    if (!rule) {
      toast.error(`No active promotion matches “${code}”`);
      return;
    }
    const targetIndex = lines.findIndex((l) => l.productId === couponLine);
    if (couponScope === "item" && targetIndex < 0) {
      toast.error("Pick the item the coupon applies to");
      return;
    }
    if (!(await unlockDiscounts())) return;
    const at = new Date().toISOString();
    if (couponScope === "item") {
      const line = lines[targetIndex]!;
      const unit =
        rule.valueType === "percent"
          ? r2((line.price * (rule.value ?? 0)) / 100)
          : r2(rule.value ?? 0);
      const value = r2(unit * line.qty);
      patchLine(targetIndex, {
        discount: rule.value ?? 0,
        discountType: rule.valueType ?? "amount",
        couponCode: rule.name,
        couponDiscount: value,
      });
      setCoupon({
        code: rule.name,
        promoId: rule.id,
        scope: "item",
        discount: value,
        productId: line.productId,
        productName: line.name,
        appliedAt: at,
      });
      logger.log("promotion", "Coupon applied to an item", "register", {
        coupon: rule.name,
        promotionId: rule.id,
        scope: "item",
        product: line.name,
        productId: line.productId,
        qty: line.qty,
        discountValue: value,
        storeId: currentStore.id,
        memberId,
        appliedAt: at,
      });
    } else {
      setCartDiscountType(rule.valueType ?? "amount");
      setCartDiscount(rule.value ?? 0);
      const value =
        rule.valueType === "percent"
          ? r2((promoBase * (rule.value ?? 0)) / 100)
          : r2(rule.value ?? 0);
      setCoupon({
        code: rule.name,
        promoId: rule.id,
        scope: "bill",
        discount: value,
        appliedAt: at,
      });
      logger.log("promotion", "Coupon applied to the bill", "register", {
        coupon: rule.name,
        promotionId: rule.id,
        scope: "bill",
        discountValue: value,
        billBase: promoBase,
        storeId: currentStore.id,
        memberId,
        appliedAt: at,
      });
    }
    setCouponCode("");
    setCouponOpen(false);
    toast.success(`Coupon ${rule.name} applied`);
  }

  /**
   * Apply a digital voucher (scanned QR or typed token). The voucher is only
   * locked in the database once the sale actually completes.
   */
  async function applyVoucher(rawToken: string) {
    const token = rawToken.trim().split("/").pop() ?? "";
    if (!token) return;
    if (!lines.length) {
      toast.error("Ring the items up before applying a voucher");
      return;
    }
    try {
      const view = await loadVoucherByToken(token);
      if (!view) {
        toast.error("That voucher code is not recognised");
        return;
      }
      if (view.voucher.status === "REDEEMED") {
        toast.error("This voucher has already been used");
        return;
      }
      const campaign = view.campaign;
      if (campaign.expiresAt && new Date() > new Date(campaign.expiresAt)) {
        toast.error("This voucher has expired");
        return;
      }
      if (view.voucher.memberId && state.members.some((m) => m.id === view.voucher.memberId)) {
        setMemberId(view.voucher.memberId);
      }

      const at = new Date().toISOString();
      if (campaign.scope === "PRODUCT") {
        const index = lines.findIndex((l) => l.productId === campaign.scopeValue);
        if (index < 0) {
          toast.error("The product this voucher covers is not on this bill");
          return;
        }
        const line = lines[index]!;
        const value = voucherValue(campaign, r2(line.price * line.qty));
        patchLine(index, {
          discount: r2(value / Math.max(1, line.qty)),
          discountType: "amount",
          couponCode: token,
          couponDiscount: value,
        });
        setCoupon({
          code: token,
          promoId: campaign.id,
          scope: "item",
          discount: value,
          productId: line.productId,
          productName: line.name,
          appliedAt: at,
          name: campaign.name,
          remaining:
            campaign.discountType === "FIXED_AMOUNT"
              ? Math.max(0, r2(campaign.discountValue - value))
              : 0,
        });
      } else {
        const base =
          campaign.scope === "CATEGORY"
            ? r2(
                lines
                  .filter(
                    (l) =>
                      state.products.find((p) => p.id === l.productId)?.category ===
                      campaign.scopeValue,
                  )
                  .reduce((a, l) => a + l.price * l.qty, 0),
              )
            : promoBase;
        if (base <= 0) {
          toast.error("Nothing on this bill qualifies for that voucher");
          return;
        }
        const value = voucherValue(campaign, base);
        setCartDiscountType("amount");
        setCartDiscount(value);
        setCoupon({
          code: token,
          promoId: campaign.id,
          scope: "bill",
          discount: value,
          appliedAt: at,
          name: campaign.name,
          remaining:
            campaign.discountType === "FIXED_AMOUNT"
              ? Math.max(0, r2(campaign.discountValue - value))
              : 0,
        });
      }

      setVoucherToken(token);
      logger.log("promotion", "Digital voucher applied", "register", {
        voucher: token,
        campaign: campaign.name,
        campaignId: campaign.id,
        scope: campaign.scope,
        memberId: view.voucher.memberId,
        storeId: currentStore.id,
        appliedAt: at,
      });
      toast.success(`${campaign.name} applied`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that voucher");
    }
  }

  /**
   * What a voucher would take off the ticket as it stands, so the cashier can
   * compare before committing. Returns 0 with a reason when it doesn't apply.
   */
  function voucherPreview(campaign: Campaign): { value: number; reason: string } {
    if (!lines.length) return { value: 0, reason: "Ring up items first" };
    if (campaign.scope === "PRODUCT") {
      const line = lines.find((l) => l.productId === campaign.scopeValue);
      if (!line) return { value: 0, reason: "That product is not on this bill" };
      return { value: voucherValue(campaign, r2(line.price * line.qty)), reason: "" };
    }
    const base =
      campaign.scope === "CATEGORY"
        ? r2(
            lines
              .filter(
                (l) =>
                  state.products.find((p) => p.id === l.productId)?.category ===
                  campaign.scopeValue,
              )
              .reduce((a, l) => a + l.price * l.qty, 0),
          )
        : promoBase;
    if (base <= 0) return { value: 0, reason: "Nothing on this bill qualifies" };
    return { value: voucherValue(campaign, base), reason: "" };
  }

  /** Take the coupon off the ticket and record who removed it. */
  function removeCoupon() {
    if (!coupon) return;
    if (coupon.scope === "item") {
      const i = lines.findIndex((l) => l.couponCode === coupon.code);
      if (i >= 0)
        patchLine(i, { discount: 0, couponCode: undefined, couponDiscount: undefined });
    } else {
      setCartDiscount(0);
    }
    logger.log("promotion", "Coupon removed", "register", {
      coupon: coupon.code,
      promotionId: coupon.promoId,
      scope: coupon.scope,
      product: coupon.productName ?? null,
      discountValue: coupon.discount,
      appliedAt: coupon.appliedAt,
      storeId: currentStore.id,
    });
    setCoupon(null);
    setVoucherToken(null);
  }

  const splitShares = useMemo(() => {
    const cents = Math.round(balanceDue * 100);
    const base = Math.floor(cents / splitWays);
    return Array.from({ length: splitWays }, (_, i) =>
      (base + (i < cents - base * splitWays ? 1 : 0)) / 100,
    );
  }, [balanceDue, splitWays]);

  /** Provisional receipt rendered from the live ticket for the overlay. */
  const previewHtml = useMemo(() => {
    if (!receiptPreview) return "";
    const source: Sale | null = lines.length
      ? {
          id: "preview",
          receiptNo: "PREVIEW",
          storeId: currentStore.id,
          shiftId: activeShift?.id ?? "",
          lines,
          subtotal: totals.subtotal,
          discount: totals.discount,
          tax: totals.tax,
          total: totals.total,
          paid: 0,
          change: 0,
          method,
          memberId,
          pointsEarned,
          cashier: activeCashier,
          createdAt: new Date().toISOString(),
          ...(exchangeRef
            ? { exchangeOfReceiptNo: exchangeRef, exchangeCredit: totals.credit }
            : {}),
        }
      : lastSale;
    return source ? saleReceiptPreview(source, member, "sale") : "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptPreview, displayKey, method, lastSale, member]);

  return (
    <AppShell>
      <div className="pos-scaled flex h-full min-h-0 min-w-0 flex-col overflow-hidden lg:flex-row">
        {/* ── LEFT: product catalog (hidden on narrow windows) ─────────── */}
        <section className="hidden min-h-0 w-full shrink-0 flex-col gap-3 border-b border-border p-4 lg:flex lg:w-[clamp(340px,32vw,520px)] lg:min-w-[340px] lg:border-b-0 lg:border-r">
          <CatalogPanel
            query={query}
            onQueryChange={setQuery}
            onScanSubmit={scanSubmit}
            categories={categories}
            category={category}
            onCategoryChange={setCategory}
            products={filtered}
            storeId={currentStore.id}
            storeName={currentStore.name}
            shiftOpen={!!activeShift}
            onAdd={addLine}
            onDetail={setDetailId}
            onOpenCustomerDisplay={
              visible("register.customerDisplay") ? openCustomerDisplay : undefined
            }
            onOpenShift={() => setOpenShiftOpen(true)}
            onRacketBooking={startRacketBooking}
            onCloseShift={
              visible("register.closeShift")
                ? async () => {
                    if (!(await requirePermission("can_close_shift"))) return;
                    setCountedCash("");
                    setCloseNote("");
                    setCloseShiftOpen(true);
                  }
                : undefined
            }
            showSearch={false}
          />
        </section>

        {/* Narrow windows: the catalog opens as a searchable popup instead. */}
        <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
          <DialogContent className="flex h-[85vh] max-w-3xl flex-col gap-3 overflow-hidden">
            <DialogHeader>
              <DialogTitle>Search &amp; add products</DialogTitle>
            </DialogHeader>
            <CatalogPanel
              query={query}
              onQueryChange={setQuery}
              onScanSubmit={(e) => {
                scanSubmit(e);
                setCatalogOpen(false);
              }}
              categories={categories}
              category={category}
              onCategoryChange={setCategory}
              products={filtered}
              storeId={currentStore.id}
              storeName={currentStore.name}
              shiftOpen={!!activeShift}
              onAdd={(id) => {
                addLine(id);
                setCatalogOpen(false);
              }}
              onDetail={(id) => {
                setDetailId(id);
                setCatalogOpen(false);
              }}
              showHeaderActions={false}
            />
          </DialogContent>
        </Dialog>

        {/* ── CENTER: active cart & register (grows with the window) ───── */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-sidebar">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Current ticket</p>
              <p className="numeric truncate text-[11px] text-muted-foreground">
                {activeShift ? `${activeShift.cashier} · shift open` : "No shift open"}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Button size="sm" className="lg:hidden" onClick={() => setCatalogOpen(true)}>
                <Search className="size-4" /> Add product
              </Button>
              {visible("register.exchange") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (await requirePermission("can_process_exchange")) setExchangeOpen(true);
                  }}
                >
                  <Repeat className="size-4" /> Exchange
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={!lines.length}
                onClick={() => void clearCart("clear")}
              >
                <Trash2 className="size-4" /> Clear
              </Button>
            </div>
          </div>

          <div className="border-b border-border px-4 py-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="min-w-0">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Scan barcode
                </Label>
                <div className="mt-2">
                  <ScanBar onScan={scanCode} />
                </div>
              </div>
              <div className="min-w-0">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Search loyalty member
                </Label>
                {member ? (
                  <div className="mt-2 flex items-center gap-2 rounded-md border border-accent/50 bg-accent/10 px-3 py-2">
                    <BadgeCheck className="size-4 shrink-0 text-accent" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{member.name}</p>
                      <p className="numeric text-[11px] text-muted-foreground">
                        {member.code} · {member.tier} · {member.points} pts · {member.phone}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 shrink-0"
                      aria-label="Purchase history"
                      onClick={() => setHistoryMemberId(memberId)}
                    >
                      <History className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 shrink-0"
                      aria-label="Detach member"
                      onClick={() => setMemberId(null)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ) : null}
                {member && memberVouchers.length ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 h-8 w-full text-xs"
                    onClick={() => setVoucherPickerOpen(true)}
                  >
                    <TicketPercent className="size-3.5" /> Vouchers ({memberVouchers.length})
                  </Button>
                ) : null}
                {member ? null : (
                  <>
                    <div className="relative mt-2">
                      <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={memberQuery}
                        onChange={(e) => setMemberQuery(e.target.value)}
                        placeholder="Phone number or name…"
                        className="h-10 pl-8 text-sm"
                      />
                    </div>
                    <div className="mt-2 space-y-1">
                      {memberMatches.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">{m.name}</p>
                            <p className="numeric text-[11px] text-muted-foreground">
                              {m.phone} · {m.points} pts · {m.tier}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            onClick={() => setHistoryMemberId(m.id)}
                          >
                            <History className="size-3" /> History
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            onClick={() => {
                              setMemberId(m.id);
                              setMemberQuery("");
                              toast.success(`${m.name} attached to receipt`);
                              // Surface any digital vouchers this member is holding.
                              void loadMemberVouchers(m.id)
                                .then((vs) => {
                                  if (!vs.length) return;
                                  toast.info(
                                    vs.length === 1
                                      ? `${m.name} has a voucher: ${vs[0]!.campaign.name}`
                                      : `${m.name} has ${vs.length} vouchers available`,
                                    {
                                      action: {
                                        label: "Apply",
                                        onClick: () => void applyVoucher(vs[0]!.voucher.tokenSlug),
                                      },
                                    },
                                  );
                                })
                                .catch(() => undefined);
                            }}
                          >
                            <UserPlus className="size-3" /> Attach
                          </Button>
                        </div>
                      ))}
                      {memberQuery.trim() && !memberMatches.length && (
                        <p className="py-1 text-[11px] text-muted-foreground">
                          No member matches “{memberQuery}”.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="divide-y divide-border">
              {lines.map((l, i) => (
                <div
                  key={`${l.credit ? "C" : "S"}-${l.productId}-${i}`}
                  className={`px-4 py-3 ${l.credit ? "bg-accent/5" : ""}`}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {l.name}
                        {l.credit && (
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            credit
                          </Badge>
                        )}
                        {l.foc && (
                          <Badge className="ml-2 bg-success/15 text-[10px] text-success">
                            FREE PROMO
                          </Badge>
                        )}
                      </div>
                      <p className="numeric text-[11px] text-muted-foreground">
                        {money(l.price)} · tax {(l.taxRate * 100).toFixed(0)}%
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="size-8"
                        onClick={() => void setQty(i, -1)}
                      >
                        <Minus className="size-3" />
                      </Button>
                      <span className="numeric w-7 text-center text-sm">{l.qty}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="size-8"
                        onClick={() => void setQty(i, 1)}
                      >
                        <Plus className="size-3" />
                      </Button>
                    </div>
                    <span
                      className={`numeric col-span-2 text-right text-sm font-semibold sm:col-span-1 sm:w-24 ${l.credit ? "text-accent" : ""}`}
                    >
                      {money((l.price - lineUnitDiscount(l)) * l.qty)}
                    </span>
                  </div>
                  {!l.credit && !l.foc && !discountAllowed && (
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={() => void unlockDiscounts()}
                        className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                      >
                        Discount locked · supervisor override
                      </button>
                    </div>
                  )}
                  {!l.credit && !l.foc && discountAllowed && (
                    <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">Disc</span>
                      <ActionButton
                        layout="inline"
                        variant="outline"
                        size="sm"
                        onClick={() => setPadTarget(i)}
                        className="numeric h-10 min-h-10 w-32 justify-between text-[11px]"
                        label={l.discount
                          ? `${l.discount}${(l.discountType ?? "amount") === "percent" ? "%" : ""}`
                          : "Add discount"}
                        icon={<Percent className="size-4" />}
                      />
                    </div>
                  )}
                </div>
              ))}
              {!lines.length && (
                <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Tap a product to start the ticket.
                </p>
              )}
            </div>
          </ScrollArea>

          <div className="shrink-0 space-y-2 border-t border-border px-4 py-3 text-sm">
            {exchangeRef && (
              <div className="flex items-center justify-between rounded-md border border-accent/40 bg-accent/10 px-2 py-1.5 text-[11px]">
                <span className="min-w-0 truncate">Exchange against bill #{exchangeRef}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9 shrink-0"
                  aria-label="Remove exchange"
                  title="Remove exchange"
                  onClick={() => {
                    setLines((ls) => ls.filter((l) => !l.credit));
                    setExchangeRef(null);
                  }}
                >
                  <X className="size-4" />
                </Button>
              </div>
            )}
            <div className="grid gap-x-8 gap-y-2 xl:grid-cols-2">
              <div className="space-y-2">
                <Row label="Subtotal" value={money(totals.subtotal)} />
                {totals.credit > 0 && (
                  <Row
                    label={`Store credit #${exchangeRef ?? ""}`}
                    value={`-${money(totals.credit)}`}
                  />
                )}
                {!discountAllowed && (
                  <button
                    onClick={() => void unlockDiscounts()}
                    className="flex w-full items-center justify-between text-muted-foreground"
                  >
                    <span>Bill discount</span>
                    <span className="text-[11px] underline-offset-2 hover:underline">
                      locked · supervisor override
                    </span>
                  </button>
                )}
                <div
                  className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 ${discountAllowed ? "" : "hidden"}`}
                >
                  <span className="text-muted-foreground">Bill discount</span>
                  <ActionButton
                    layout="inline"
                    variant="outline"
                    size="sm"
                    onClick={() => setPadTarget("bill")}
                    className="numeric h-10 min-h-10 w-32 justify-between text-xs"
                    label={cartDiscount
                      ? `${cartDiscount}${cartDiscountType === "percent" ? "%" : ""}`
                      : "Add discount"}
                    icon={<Percent className="size-4" />}
                  />
                </div>
                {promo.promoDiscount > 0 && (
                  <Row label="Promotion discount" value={`-${money(promo.promoDiscount)}`} />
                )}
                <Row label="Discount applied" value={`-${money(totals.discount)}`} />
                <Row
                  label={
                    !taxSettings.enabled
                      ? "Tax (disabled)"
                      : taxSettings.mode === "inclusive"
                        ? `Tax ${taxSettings.rate}% (included)`
                        : `Tax ${taxSettings.rate}%`
                  }
                  value={money(totals.tax)}
                />
              </div>

              <div className="space-y-2">
                {promo.applied.length > 0 && (
                  <div className="rounded-md border border-success/30 bg-success/5 px-2 py-2">
                    <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-success">
                      <Sparkles className="size-3" /> Active promotions applied
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {promo.applied.map((a) => (
                        <li key={a.id} className="text-[11px] text-muted-foreground">
                          <span className="font-medium text-foreground">{a.name}</span> · {a.detail}
                        </li>
                      ))}
                    </ul>
                    {member && (
                      <p className="numeric mt-1 text-[11px] text-muted-foreground">
                        {member.name} earns {pointsEarned} pts on this bill
                      </p>
                    )}
                  </div>
                )}
                {coupon && (
                  <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/10 px-2 py-1.5 text-[11px]">
                    <span className="min-w-0 truncate">
                      Coupon <span className="font-semibold">{coupon.code}</span> ·{" "}
                      {coupon.scope === "item" ? coupon.productName : "whole bill"} ·{" "}
                      <span className="numeric">-{money(coupon.discount)}</span>
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-9 shrink-0"
                      aria-label="Remove coupon"
                      title="Remove coupon"
                      onClick={removeCoupon}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                )}
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold">
                    {refundDue > 0 ? "Refund due" : "Balance due"}
                  </span>
                  <span
                    className={`numeric text-2xl font-bold ${refundDue > 0 ? "text-accent" : "text-primary"}`}
                  >
                    {money(refundDue > 0 ? refundDue : balanceDue)}
                  </span>
                </div>
                <ActionButton
                  layout="inline"
                  className="h-12 w-full text-base"
                  disabled={!lines.length || tillLocked || (refundDue > 0 && !canRefund)}
                  disabledReason={tillLocked ? lockedReason : undefined}
                  onClick={() => openPayment()}
                  icon={<Banknote className="size-5" />}
                  label={!activeShift
                    ? "Shift closed — selling locked"
                    : refundDue > 0
                      ? canRefund
                        ? `Refund ${money(refundDue)}`
                        : "Refunds locked for this user"
                      : `Charge ${money(balanceDue)}`}
                />
                <ActionButton
                  layout="inline"
                  variant="outline"
                  className="h-11 w-full"
                  label="Book & pay later"
                  icon={<CalendarClock className="size-4" />}
                  disabled={tillLocked || refundDue > 0 || !lines.length}
                  disabledReason={tillLocked ? lockedReason : undefined}
                  onClick={() => {
                    setDeposit("");
                    setBookName(member?.name ?? "");
                    setBookPhone(member?.phone ?? "");
                    setBookMode("cart");
                    resetJobCard();
                    setBookOpen(true);
                  }}
                />
              </div>
            </div>

            {lastSale && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
                {can("can_reprint_bill") && (
                  <ActionButton
                    layout="inline"
                    variant="outline"
                    size="sm"
                    label="Reprint"
                    icon={<Printer className="size-4" />}
                    disabled={tillLocked}
                    disabledReason={tillLocked ? lockedReason : undefined}
                    onClick={() => {
                      printSaleReceipt(
                        lastSale,
                        state.members.find((m) => m.id === lastSale.memberId) ?? null,
                        "duplicate",
                      );
                      logTicketEvent(TICKET_ACTIONS.reprinted, {
                        saleId: lastSale.id,
                        receiptNo: lastSale.receiptNo,
                        template: "duplicate",
                        storeId: currentStore.id,
                      });
                    }}
                  />
                )}
                <ActionButton
                  layout="inline"
                  variant="outline"
                  size="sm"
                  label="Gift"
                  icon={<Gift className="size-4" />}
                  disabled={tillLocked}
                  disabledReason={tillLocked ? lockedReason : undefined}
                  onClick={() => {
                    printSaleReceipt(lastSale, null, "gift");
                    logger.log("print", "Gift receipt printed", "register", {
                      saleId: lastSale.id,
                      receiptNo: lastSale.receiptNo,
                    });
                  }}
                />
                <ActionButton
                  layout="inline"
                  variant="outline"
                  size="sm"
                  label="Kitchen"
                  icon={<ChefHat className="size-4" />}
                  disabled={tillLocked}
                  disabledReason={tillLocked ? lockedReason : undefined}
                  onClick={() => {
                    printSaleReceipt(lastSale, null, "kitchen");
                    logger.log("print", "Kitchen receipt printed", "register", {
                      saleId: lastSale.id,
                      receiptNo: lastSale.receiptNo,
                    });
                  }}
                />
                {wa.enabled && can("can_send_whatsapp_bill") && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={waNumber}
                      onChange={(e) => setWaNumber(e.target.value)}
                      placeholder="WhatsApp number"
                      className="numeric h-9 w-44"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={waSending || !waNumber.trim()}
                      onClick={() => void sendSaleOnWhatsApp(lastSale, waNumber)}
                    >
                      <MessageCircle className="size-4" />
                      {waSending ? "Sending…" : "Send bill"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── RIGHT: operation deck. Below lg it collapses into a bar under
            the totals so it can never overlap the Charge buttons. ───────── */}
        <aside className="flex w-full shrink-0 flex-col border-t border-border bg-background lg:w-[288px] lg:border-l lg:border-t-0">
          <button
            type="button"
            onClick={() => setDeckOpen((v) => !v)}
            aria-expanded={deckOpen}
            className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:hidden"
          >
            <span>Register actions</span>
            <ChevronUp className={`size-4 transition-transform ${deckOpen ? "" : "rotate-180"}`} />
          </button>
          <div
            className={`${deckOpen ? "flex" : "hidden"} max-h-[45vh] min-h-0 flex-col gap-3 overflow-y-auto p-3 pt-0 lg:flex lg:max-h-none lg:pt-3`}
          >
          {/* Card 1 · transaction actions */}
          {visible("register.transactionActions") && (
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Transaction actions
            </p>
            <div className="grid auto-rows-fr grid-cols-2 gap-2">
              {visible("register.holdOrder") && (
              <ActionButton
                variant="outline"
                className="h-16 min-w-0"
                label="Hold order"
                icon={<PauseCircle className="size-4" />}
                disabled={!lines.length || tillLocked}
                disabledReason={tillLocked ? lockedReason : undefined}
                onClick={() => holdOrder()}
              />
              )}
              <ActionButton
                variant="outline"
                className="h-16 min-w-0 text-destructive hover:text-destructive"
                label="Void cart"
                icon={<Trash2 className="size-4" />}
                disabled={!lines.length || tillLocked}
                disabledReason={tillLocked ? lockedReason : undefined}
                onClick={() => void clearCart()}
              />
              {visible("register.coupon") && (
              <ActionButton
                variant="outline"
                className="h-16 min-w-0"
                label="Apply coupon"
                icon={<TicketPercent className="size-4" />}
                disabled={tillLocked}
                disabledReason={tillLocked ? lockedReason : undefined}
                onClick={() => setCouponOpen(true)}
              />
              )}
              {visible("register.splitBill") && (
              <ActionButton
                variant="outline"
                className="h-16 min-w-0"
                label="Split bill"
                icon={<Split className="size-4" />}
                disabled={balanceDue <= 0 || tillLocked}
                disabledReason={tillLocked ? lockedReason : undefined}
                onClick={() => setSplitOpen(true)}
              />
              )}
            </div>
            {held.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground">Held orders ({held.length})</p>
                  <Link
                    to="/holds"
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    Hold tickets
                  </Link>
                </div>
                {held.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => resumeHeld(h.id)}
                    className="flex w-full items-center justify-between rounded-md border border-border px-2 py-1.5 text-[11px] hover:border-primary/60"
                  >
                    <span className="truncate">
                      {h.cancelledFrom ? "↩ " : ""}
                      {h.label}
                    </span>
                    <span className="numeric font-semibold">{money(h.total)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          )}

          {/* Card 2 · device & printing */}
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Device &amp; printing
            </p>
            <ActionButton
              layout="inline"
              variant="outline"
              className="h-12 w-full sm:gap-3"
              label="Open cash drawer"
              icon={<Vault className="size-4" />}
              disabled={tillLocked}
              disabledReason={tillLocked ? lockedReason : undefined}
              onClick={async () => {
                if (!(await requirePermission("can_open_drawer"))) return;
                setNoSaleNote("");
                setNoSaleReason("");
                setNoSaleOpen(true);
              }}
            />
            <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <Label htmlFor="live-receipt" className="text-xs leading-tight">
                Live receipt preview
                <span className="block text-[11px] font-normal text-muted-foreground">
                  Opens as an overlay
                </span>
              </Label>
              <Switch
                id="live-receipt"
                checked={receiptPreview}
                onCheckedChange={setReceiptPreview}
              />
            </div>
          </div>
          </div>
        </aside>
      </div>

      {/* Live receipt preview overlay */}
      <Sheet open={receiptPreview} onOpenChange={setReceiptPreview}>
        <SheetContent side="right" className="w-[420px] sm:max-w-none">
          <SheetHeader>
            <SheetTitle>Live receipt preview</SheetTitle>
          </SheetHeader>
          <div className="mt-4 h-[calc(100vh-8rem)] overflow-hidden rounded-md border border-border bg-white">
            {previewHtml ? (
              <iframe
                title="Receipt preview"
                srcDoc={previewHtml}
                className="h-full w-full"
              />
            ) : (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Add items to the ticket to preview the printed receipt.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Apply coupon */}
      <Dialog open={couponOpen} onOpenChange={setCouponOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Apply coupon</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Coupon code</Label>
            <Input
              autoFocus
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              placeholder="e.g. WEEKEND10"
            />
            <Label>Apply to</Label>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                variant={couponScope === "bill" ? "default" : "outline"}
                onClick={() => setCouponScope("bill")}
              >
                Whole bill
              </Button>
              <Button
                size="sm"
                className="flex-1"
                variant={couponScope === "item" ? "default" : "outline"}
                onClick={() => setCouponScope("item")}
              >
                Single item
              </Button>
            </div>
            {couponScope === "item" && (
              <div className="max-h-40 space-y-1 overflow-auto rounded-md border border-border p-2">
                {lines.filter((l) => !l.credit && !l.foc).length === 0 && (
                  <p className="text-[11px] text-muted-foreground">No eligible items in the cart.</p>
                )}
                {lines
                  .filter((l) => !l.credit && !l.foc)
                  .map((l) => (
                    <button
                      key={l.productId}
                      onClick={() => setCouponLine(l.productId)}
                      className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs ${
                        couponLine === l.productId ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      }`}
                    >
                      <span className="truncate">{l.name}</span>
                      <span className="numeric">×{l.qty}</span>
                    </button>
                  ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Codes match an active promotion by name. Every application, its scope and the item it
              touched are written to the audit trail with a timestamp.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCouponOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void applyCoupon()}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Split bill */}
      <Dialog open={splitOpen} onOpenChange={setSplitOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Split bill</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Bill total</span>
              <span className="numeric font-semibold">{money(balanceDue)}</span>
            </div>
            <div className="space-y-1">
              <Label>Split between</Label>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setSplitWays((n) => Math.max(2, n - 1))}
                >
                  <Minus className="size-3" />
                </Button>
                <span className="numeric w-10 text-center text-lg font-semibold">{splitWays}</span>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setSplitWays((n) => Math.min(12, n + 1))}
                >
                  <Plus className="size-3" />
                </Button>
                <span className="text-sm text-muted-foreground">guests</span>
              </div>
            </div>
            <div className="rounded-md border border-border p-3">
              {splitShares.map((amount, i) => (
                <div key={i} className="flex items-center justify-between py-0.5 text-sm">
                  <span className="text-muted-foreground">Guest {i + 1}</span>
                  <span className="numeric font-semibold">{money(amount)}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Take each share as a separate tender, then complete the bill on the final payment.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSplitOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                setSplitOpen(false);
                logger.log("sale", "Bill split across guests", "register", {
                  ways: splitWays,
                  billTotal: balanceDue,
                  shares: splitShares,
                  storeId: currentStore.id,
                  memberId,
                });
                openPayment("cash");
              }}
            >
              Take payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cross-store stock */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detail?.name}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <p className="numeric text-xs text-muted-foreground">
                {detail.sku} · {detail.barcode} · {money(detail.price)}
              </p>
              <Separator />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Stock across all locations
              </p>
              <div className="space-y-1">
                {state.stores.map((s) => {
                  const qty = stockAt(detail, s.id);
                  return (
                    <div
                      key={s.id}
                      className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                        s.id === currentStore.id ? "border-primary/50 bg-primary/10" : "border-border"
                      }`}
                    >
                      <span>
                        {s.name}{" "}
                        <span className="text-[11px] text-muted-foreground">({s.code})</span>
                      </span>
                      <span
                        className={`numeric font-semibold ${
                          qty <= 0
                            ? "text-destructive"
                            : qty <= detail.reorderLevel
                              ? "text-warning"
                              : "text-foreground"
                        }`}
                      >
                        {qty}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Stock counts are shared company-wide. Financial metrics stay locked to{" "}
                {currentStore.name}.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {refundDue > 0
                ? `Refund customer · ${money(refundDue)}`
                : `Take payment · ${money(balanceDue)}`}
            </DialogTitle>
          </DialogHeader>
          {exchangeRef && (
            <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs">
              Store credit of {money(totals.credit)} from bill #{exchangeRef} applied to this
              ticket.
            </p>
          )}
          <div className="grid grid-cols-5 gap-2">
            {(
              [
                { m: "cash", icon: Banknote, label: "Cash" },
                { m: "card", icon: CreditCard, label: "Card" },
                { m: "wallet", icon: Wallet, label: "Wallet" },
                { m: "points", icon: BadgeCheck, label: "Points" },
                { m: "bank_transfer", icon: Landmark, label: "Transfer" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.m}
                onClick={() => setMethod(opt.m)}
                className={`flex flex-col items-center gap-1 rounded-md border px-2 py-3 text-xs transition-colors ${
                  method === opt.m
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <opt.icon className="size-4" />
                {opt.label}
              </button>
            ))}
          </div>

          {method === "cash" && refundDue > 0 && (
            <p className="numeric text-sm text-muted-foreground">
              Pay {money(refundDue)} back to the customer as cash or store credit.
            </p>
          )}
          {method === "cash" && refundDue === 0 && (
            <div className="space-y-2">
              <Label>Cash tendered</Label>
              <Input
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                className="numeric h-12 text-xl"
              />
              <div className="flex gap-2">
                {[balanceDue, 20, 50, 100].map((v, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    onClick={() => setTendered(v.toFixed(2))}
                  >
                    {money(v)}
                  </Button>
                ))}
              </div>
              <p className="numeric text-sm text-muted-foreground">
                Change due {money(Math.max(0, Number(tendered || 0) - balanceDue))}
              </p>
            </div>
          )}
          {method === "points" && (
            <p className="text-sm text-muted-foreground">
              {member
                ? `${member.name} has ${member.points} points (100 pts = $1).`
                : "Attach a member to pay with points."}
            </p>
          )}
          {method === "card" && refundDue === 0 && tenders.length === 0 && (
            <div className="space-y-2">
              <Label>Bank / card machine used</Label>
              <Input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. HSBC terminal 2"
              />
            </div>
          )}

          {refundDue === 0 && (
            <TenderSplit
              total={balanceDue}
              tenders={tenders}
              onChange={setTenders}
              onBeforeAdd={() => requirePermission("can_edit_tenders")}
            />
          )}
          {method === "bank_transfer" && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">
                The customer screen is now showing your bank details and WhatsApp QR code so the
                shopper can transfer {money(balanceDue)}.
              </p>
              <div className="numeric space-y-0.5 text-sm">
                {state.settings.payment.bankName && <p>{state.settings.payment.bankName}</p>}
                {state.settings.payment.accountName && (
                  <p>{state.settings.payment.accountName}</p>
                )}
                {state.settings.payment.accountNumber && (
                  <p className="font-bold">{state.settings.payment.accountNumber}</p>
                )}
              </div>
              <Label>Transfer reference / slip number</Label>
              <Input
                value={transferRef}
                onChange={(e) => setTransferRef(e.target.value)}
                placeholder="e.g. TRX-889210"
              />
            </div>
          )}

          <DialogFooter className="items-center gap-2">
            {refundDue === 0 && tenders.length > 0 && validateTenders(balanceDue, tenders).error && (
              <span className="mr-auto text-[11px] font-medium text-destructive">
                {validateTenders(balanceDue, tenders).error}
              </span>
            )}
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={completeSale}
              disabled={
                refundDue === 0 && tenders.length > 0 && !!validateTenders(balanceDue, tenders).error
              }
            >
              Complete &amp; print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* No-sale drawer open */}
      <Dialog open={noSaleOpen} onOpenChange={setNoSaleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open drawer without a sale</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            This open is logged against {user?.name ?? "this user"} with a timestamp.
          </p>
          <div className="space-y-2">
            <Label htmlFor="no-sale-reason">Reason (type it out)</Label>
            <Input
              id="no-sale-reason"
              autoFocus
              value={noSaleReason}
              maxLength={NO_SALE_REASON_MAX}
              placeholder="e.g. Adding change float for the till"
              onChange={(e) => setNoSaleReason(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              {noSaleReason.trim().length < NO_SALE_REASON_MIN
                ? `Type at least ${NO_SALE_REASON_MIN} characters — no preset reasons.`
                : `${noSaleReason.trim().length}/${NO_SALE_REASON_MAX} characters`}
            </p>
            <Label>Note (optional)</Label>
            <Input value={noSaleNote} onChange={(e) => setNoSaleNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoSaleOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={noSaleReason.trim().length < NO_SALE_REASON_MIN}
              onClick={async () => {
                const reason = noSaleReason.trim();
                if (reason.length < NO_SALE_REASON_MIN) return;
                const approved = await requirePermission("can_no_sale_open");
                if (!approved) return;
                recordNoSale({
                  storeId: currentStore.id,
                  terminalId: null,
                  shiftId: activeShift?.id ?? null,
                  staffId: user?.staffId ?? "unknown",
                  staffName: user?.name ?? "Unknown",
                  role: user?.role ?? "unknown",
                  reason,
                  note: noSaleNote.trim(),
                  approvedBy: can("can_no_sale_open") ? null : "supervisor override",
                });
                openCashDrawer();
                setNoSaleOpen(false);
                setNoSaleReason("");
                setNoSaleNote("");
                toast.success("Drawer opened and logged");
              }}
            >
              Open &amp; log
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exchange lookup */}
      <Dialog
        open={exchangeOpen}
        onOpenChange={(o) => {
          setExchangeOpen(o);
          if (!o) {
            setBillHit(null);
            setPicks({});
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Exchange item</DialogTitle>
          </DialogHeader>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              lookupBill();
            }}
          >
            <Input
              autoFocus
              value={billQuery}
              onChange={(e) => setBillQuery(e.target.value)}
              placeholder="Scan or type original bill number…"
              className="numeric h-11"
            />
            <Button type="submit" className="h-11">
              <Search className="size-4" /> Find
            </Button>
          </form>

          {billHit && (
            <div className="space-y-3">
              <p className="numeric text-xs text-muted-foreground">
                {billHit.receiptNo} · {new Date(billHit.createdAt).toLocaleString()} ·{" "}
                {money(billHit.total)} · {billHit.cashier}
                {billHit.exchangedToReceiptNo
                  ? ` · already exchanged to ${billHit.exchangedToReceiptNo}`
                  : ""}
              </p>
              <Separator />
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {billHit.lines.map((l, idx) => {
                  const picked = picks[idx] ?? 0;
                  const unit = r2(l.price - lineUnitDiscount(l));
                  return (
                    <div
                      key={`${l.productId}-${idx}`}
                      className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        aria-label={`Exchange ${l.name}`}
                        checked={picked > 0}
                        onChange={(e) =>
                          setPicks((p) => ({ ...p, [idx]: e.target.checked ? l.qty : 0 }))
                        }
                        className="size-4 accent-[hsl(var(--primary))]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{l.name}</p>
                        <p className="numeric text-[11px] text-muted-foreground">
                          sold {l.qty} × {money(unit)}
                        </p>
                      </div>
                      <Input
                        value={picked || ""}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(l.qty, Number(e.target.value) || 0));
                          setPicks((p) => ({ ...p, [idx]: v }));
                        }}
                        placeholder="0"
                        className="numeric h-8 w-16 text-right"
                      />
                      <span className="numeric w-20 text-right text-sm font-semibold text-accent">
                        -{money(unit * picked)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Returned items are credited even when their stock at {currentStore.name} is 0 —
                the stock is added back on completion.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setExchangeOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!billHit} onClick={addExchangeCredits}>
              Add credit to cart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Book & pay later (goods) / racket stringing booking */}
      <Dialog
        open={bookOpen}
        onOpenChange={(o) => {
          setBookOpen(o);
          if (!o && racketMode) resetJobCard();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {racketMode ? "Racket / stringing booking" : "Book & pay later"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-border px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Booking total</span>
                <span className="numeric font-semibold">{money(bookingTotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Balance after deposit</span>
                <span className="numeric font-semibold text-primary">
                  {money(
                    r2(
                      Math.max(
                        0,
                        bookingTotal -
                          (payTiming === "collection"
                            ? 0
                            : payTiming === "now"
                              ? bookingTotal
                              : Number(deposit || 0)),
                      ),
                    ),
                  )}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {racketMode
                  ? `Job taken at ${currentStore.name} — no cart items needed.`
                  : `${lines.reduce((a, l) => a + l.qty, 0)} unit(s) are reserved at ${currentStore.name} until the collect-by date.`}
              </p>
            </div>
            {useServices && !racketMode && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>What is this booking for?</Label>
                  <ThemedSelect
                    ariaLabel="Booking service"
                    value={serviceId}
                    placeholder="Choose a service"
                    onChange={(v) => {
                      setServiceId(v);
                      const hit = serviceTypes.find((s2) => s2.id === v);
                      if (hit) setServiceFee(hit.fee ? String(hit.fee) : "");
                    }}
                    options={[
                      ...cartServiceTypes.map((s2) => ({ value: s2.id, label: s2.name })),
                      ...(state.settings.integrations.allowCustomServiceType !== false
                        ? [{ value: "", label: "Something else…" }]
                        : []),
                    ]}
                  />
                  {!serviceId && state.settings.integrations.allowCustomServiceType !== false && (
                    <Input
                      className="mt-1"
                      placeholder="Describe the job"
                      value={customService}
                      onChange={(e) => setCustomService(e.target.value)}
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Service fee</Label>
                  <Input
                    className="numeric text-right"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={serviceFee}
                    onChange={(e) => setServiceFee(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Added on top of the items in the cart.
                  </p>
                </div>
              </div>
            )}
            {racketMode && (
              <div className="space-y-1">
                <Label>Stringing fee</Label>
                <Input
                  className="numeric text-right"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={serviceFee}
                  onChange={(e) => setServiceFee(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label>When does the customer pay?</Label>
              <div className="flex overflow-hidden rounded-md border border-border">
                {(["now", "deposit", "collection"] as BookingPaymentTiming[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setPayTiming(t)}
                    className={`flex-1 px-2 py-2 text-xs ${
                      payTiming === t
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {BOOKING_TIMING_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Deposit taken now</Label>
                <Input
                  value={payTiming === "now" ? bookingTotal.toFixed(2) : payTiming === "collection" ? "0.00" : deposit}
                  disabled={payTiming !== "deposit"}
                  onChange={(e) => setDeposit(e.target.value)}
                  placeholder="0.00"
                  className="numeric"
                />
              </div>
              <div className="space-y-1">
                <Label>Deposit method</Label>
                <div className="flex overflow-hidden rounded-md border border-border">
                  {(["cash", "card", "wallet"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setDepositMethod(m)}
                      className={`flex-1 px-2 py-2 text-xs capitalize ${
                        depositMethod === m
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Collect &amp; settle by</Label>
                <Input
                  type="date"
                  value={dueDate}
                  min={isoDaysFromNow(0)}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="numeric"
                />
              </div>
              <div className="space-y-1">
                <Label>Quick window</Label>
                <div className="flex gap-1">
                  {[7, 14, 30, 60].map((d) => (
                    <button
                      key={d}
                      onClick={() => setDueDate(isoDaysFromNow(d))}
                      className="flex-1 rounded-md border border-border py-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Customer name</Label>
                <Input value={bookName} onChange={(e) => setBookName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input
                  value={bookPhone}
                  onChange={(e) => setBookPhone(e.target.value)}
                  className="numeric"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Note</Label>
              <Input
                value={bookNote}
                onChange={(e) => setBookNote(e.target.value)}
                placeholder="Colour, size, collection instructions…"
              />
            </div>

            {/* Racket stringing job card — racket bookings only */}
            {racketMode && (
            <div className="rounded-md border border-border">
              <div className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium">
                <span className="flex min-w-0 items-center gap-2">
                  <Wrench className="size-4 shrink-0 text-primary" />
                  <span className="truncate">Racket / stringing job card</span>
                </span>
              </div>
              <div className="space-y-3 border-t border-border p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Racket brand / model</Label>
                      <Input
                        value={racketModel}
                        onChange={(e) => setRacketModel(e.target.value)}
                        placeholder="Yonex Astrox 88D"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>String type / brand</Label>
                      <Input
                        value={stringType}
                        onChange={(e) => setStringType(e.target.value)}
                        placeholder="BG65 Ti"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label>Tension main</Label>
                      <Input
                        value={tensionMain}
                        inputMode="decimal"
                        onChange={(e) => setTensionMain(e.target.value)}
                        className="numeric"
                        placeholder="26"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Tension cross</Label>
                      <Input
                        value={tensionCross}
                        inputMode="decimal"
                        onChange={(e) => setTensionCross(e.target.value)}
                        className="numeric"
                        placeholder="28"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Unit</Label>
                      <div className="flex overflow-hidden rounded-md border border-border">
                        {(["lb", "kg"] as const).map((u) => (
                          <button
                            key={u}
                            onClick={() => setTensionUnit(u)}
                            className={`flex-1 px-2 py-2 text-xs uppercase ${
                              tensionUnit === u
                                ? "bg-primary/15 text-primary"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {u}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Promised ready date &amp; time</Label>
                    <Input
                      type="datetime-local"
                      value={promisedAt}
                      onChange={(e) => setPromisedAt(e.target.value)}
                      className="numeric"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Grommet / grip notes</Label>
                    <Input
                      value={grommetNotes}
                      onChange={(e) => setGrommetNotes(e.target.value)}
                      placeholder="Two cracked grommets at 12 o'clock, replace grip"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Anything else the stringer needs</Label>
                    <Input
                      value={jobNotes}
                      onChange={(e) => setJobNotes(e.target.value)}
                      placeholder="Knot preference, stencil, urgent…"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={notifyWhatsApp}
                      onChange={(e) => setNotifyWhatsApp(e.target.checked)}
                    />
                    Notify the customer on WhatsApp when the racket is ready
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    A job tag prints with the slip so it can be tied to the racket.
                  </p>
              </div>
            </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void bookAndPayLater()}>Reserve &amp; print slip</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Open shift */}
      <Dialog open={openShiftOpen} onOpenChange={setOpenShiftOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open shift</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Cashier</Label>
              <Input value={cashier} onChange={(e) => setCashier(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Opening float</Label>
              <Input
                value={float}
                onChange={(e) => setFloat(e.target.value)}
                className="numeric"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (!can("can_open_shift")) {
                  toast.error("You are not allowed to open a shift");
                  return;
                }
                openShift(cashier || "Cashier", Number(float) || 0);
                openCashDrawer();
                setOpenShiftOpen(false);
                toast.success("Shift opened");
              }}
            >
              Open shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MemberHistoryDialog
        member={state.members.find((m) => m.id === historyMemberId) ?? null}
        onOpenChange={(o) => !o && setHistoryMemberId(null)}
      />

      {/* Pick which of the member's vouchers goes on this bill */}
      <Dialog open={voucherPickerOpen} onOpenChange={setVoucherPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Member vouchers</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {[...memberVouchers]
              .map((v) => ({ v, preview: voucherPreview(v.campaign) }))
              .sort((a, b) => b.preview.value - a.preview.value)
              .map(({ v, preview }) => {
                const active = voucherToken === v.voucher.tokenSlug;
                const usable = preview.value > 0;
                return (
                  <button
                    key={v.voucher.id}
                    type="button"
                    disabled={!usable}
                    onClick={() => {
                      void applyVoucher(v.voucher.tokenSlug);
                      setVoucherPickerOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${
                      active ? "border-accent bg-accent/10" : "border-border"
                    } ${usable ? "hover:bg-muted" : "opacity-50"}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{v.campaign.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {discountLabel(v.campaign)} · {scopeLabel(v.campaign)}
                        {v.voucher.expiresAt || v.campaign.expiresAt
                          ? ` · until ${new Date(
                              v.voucher.expiresAt ?? v.campaign.expiresAt!,
                            ).toLocaleDateString()}`
                          : ""}
                      </p>
                      {usable ? null : (
                        <p className="text-[11px] text-destructive">{preview.reason}</p>
                      )}
                    </div>
                    <span className="numeric shrink-0 text-sm font-semibold">
                      −{money(preview.value)}
                    </span>
                  </button>
                );
              })}
            {!memberVouchers.length ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                This member has no live vouchers.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            {voucherToken ? (
              <Button
                variant="outline"
                onClick={() => {
                  removeCoupon();
                  setVoucherPickerOpen(false);
                }}
              >
                Remove applied voucher
              </Button>
            ) : null}
            <Button onClick={() => setVoucherPickerOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close shift — straight from the register header */}
      <Dialog open={closeShiftOpen} onOpenChange={setCloseShiftOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close shift</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Opened by {activeShift?.cashier} · float{" "}
              {money(activeShift?.openingFloat ?? 0)}
            </p>
            <div className="space-y-1">
              <Label>Counted cash in drawer</Label>
              <Input
                className="numeric"
                inputMode="decimal"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Note (optional)</Label>
              <Input value={closeNote} onChange={(e) => setCloseNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseShiftOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const amount = Number(countedCash);
                if (!Number.isFinite(amount) || amount < 0) {
                  toast.error("Enter the counted cash amount");
                  return;
                }
                const closed = closeShift(amount, closeNote.trim());
                if (!closed) {
                  toast.error("This shift was opened on another terminal");
                  return;
                }
                setCloseShiftOpen(false);
                toast.success("Shift closed");
              }}
            >
              Close shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscountPad
        open={padTarget !== null}
        onOpenChange={(o) => !o && setPadTarget(null)}
        title={padTarget === "bill" ? "Bill discount" : "Line discount"}
        value={
          padTarget === "bill" ? cartDiscount : typeof padTarget === "number"
            ? (lines[padTarget]?.discount ?? 0)
            : 0
        }
        type={
          padTarget === "bill"
            ? cartDiscountType
            : typeof padTarget === "number"
              ? (lines[padTarget]?.discountType ?? "amount")
              : "amount"
        }
        onApply={(v, t) => {
          if (padTarget === "bill") {
            setCartDiscount(v);
            setCartDiscountType(t);
          } else if (typeof padTarget === "number") {
            patchLine(padTarget, { discount: v, discountType: t });
          }
        }}
      />
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="numeric">{value}</span>
    </div>
  );
}