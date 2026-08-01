export type Store = {
  id: string;
  code: string;
  name: string;
  address: string;
  phone: string;
  /** optional branch-level receipt branding overrides */
  receiptOverrides?: ReceiptOverride;
};

export type Product = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  price: number;
  cost: number;
  /** online storefront price */
  ecomPrice?: number;
  /** visible on the e-commerce website */
  ecomVisible?: boolean;
  /** stock per store id */
  stockByStore: Record<string, number>;
  reorderLevel: number;
  taxRate: number;
  /** bonus loyalty points awarded for this item (bulk import field) */
  customPoints?: number;
};

export type Member = {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  tier: "Bronze" | "Silver" | "Gold";
  points: number;
  totalSpend: number;
  joinedAt: string;
  homeStoreId?: string;
  /** date of birth, ISO yyyy-mm-dd — powers birthday promotions */
  birthday?: string;
};

export type CartLine = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  taxRate: number;
  discount: number;
  /** how `discount` is interpreted: flat amount per unit, or percent of price */
  discountType?: DiscountType;
  /** exchange credit line (negative qty) returned against an earlier bill */
  credit?: boolean;
  /** free-of-charge promo line, priced at 0 */
  foc?: boolean;
  /** promotion that generated this line */
  promoId?: string;
  /** coupon code applied directly to this line */
  couponCode?: string;
  /** currency value the coupon took off this line */
  couponDiscount?: number;
};

export type DiscountType = "amount" | "percent";

/** Round to cents without float drift. */
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Resolve a cart line's per-unit discount in currency. */
export const lineUnitDiscount = (l: Pick<CartLine, "price" | "discount" | "discountType">) =>
  l.discountType === "percent" ? r2((l.price * (l.discount || 0)) / 100) : r2(l.discount || 0);

export type PaymentMethod = "cash" | "card" | "wallet" | "points" | "bank_transfer";

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  wallet: "Wallet",
  points: "Points",
  bank_transfer: "Bank transfer",
};

export type Sale = {
  id: string;
  receiptNo: string;
  storeId: string;
  shiftId: string;
  lines: CartLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  change: number;
  method: PaymentMethod;
  memberId: string | null;
  pointsEarned: number;
  cashier: string;
  createdAt: string;
  refunded?: boolean;
  /** original bill this sale exchanges against */
  exchangeOfReceiptNo?: string;
  /** new bill that exchanged this one */
  exchangedToReceiptNo?: string;
  /** credit value carried over from the original bill */
  exchangeCredit?: number;
  /** booking (pay-later ticket) this bill settles */
  bookingRef?: string;
  /** bank-transfer slip / reference number captured at the till */
  transferRef?: string;
  /** coupon code used on this bill */
  couponCode?: string;
  /** promotion the coupon matched */
  couponPromoId?: string;
  /** whether the coupon hit the whole bill or one line */
  couponScope?: "bill" | "item";
  /** currency value the coupon took off */
  couponDiscount?: number;
};

export type Shift = {
  id: string;
  storeId: string;
  cashier: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: number;
  countedCash: number | null;
  note: string;
};

export type TransferKind = "transfer" | "request";
export type TransferStatus = "requested" | "in_transit" | "received" | "rejected" | "cancelled";

export type TransferItem = {
  productId: string;
  qty: number;
};

export type Transfer = {
  id: string;
  ref: string;
  kind: TransferKind;
  /** store the goods leave from */
  fromStoreId: string;
  /** store the goods arrive at */
  toStoreId: string;
  /** one or more products moved together on the same note */
  items: TransferItem[];
  status: TransferStatus;
  note: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type PosState = {
  stores: Store[];
  currentStoreId: string;
  products: Product[];
  members: Member[];
  sales: Sale[];
  shifts: Shift[];
  transfers: Transfer[];
  promotions: Promotion[];
  bookings: Booking[];
  counter: number;
  transferCounter: number;
  bookingCounter: number;
  settings: AppSettings;
};

/* ----------------------------- bookings ----------------------------- */

export type BookingStatus = "active" | "collected" | "cancelled";

export type BookingPayment = {
  id: string;
  amount: number;
  method: PaymentMethod;
  at: string;
  cashier: string;
};

/** A "book now, pay later" ticket. Stock is reserved the moment it is created. */
export type Booking = {
  id: string;
  ref: string;
  storeId: string;
  shiftId: string;
  lines: CartLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  /** everything paid so far (initial deposit + part payments) */
  paid: number;
  payments: BookingPayment[];
  /** ISO yyyy-mm-dd the customer must settle & collect by */
  dueDate: string;
  memberId: string | null;
  customerName: string;
  customerPhone: string;
  note: string;
  cashier: string;
  createdAt: string;
  status: BookingStatus;
  closedAt?: string;
  /** receipt number of the bill raised when the goods were collected */
  saleReceiptNo?: string;
};

export const bookingBalance = (b: Pick<Booking, "total" | "paid">) =>
  r2(Math.max(0, b.total - b.paid));

/** Bank-transfer / e-wallet details shown to the customer. */
export type PaymentDetails = {
  accountName: string;
  bankName: string;
  accountNumber: string;
  /** international format, powers the WhatsApp QR code */
  whatsapp: string;
  note: string;
  /** also print the transfer block on booking slips */
  showOnBookingSlip: boolean;
  /** payment QR shown on the customer display when paying by transfer */
  paymentQr?: PaymentQr;
};

/**
 * A bank / e-wallet payment QR. `static` prints the payload as-is; `dynamic`
 * substitutes {amount} and {reference} with the live bill figures.
 */
export type PaymentQr = {
  enabled: boolean;
  mode: "static" | "dynamic";
  /** EMVCo / UPI / PromptPay / DuitNow payload, or any URL */
  payload: string;
  label: string;
};

export const defaultPaymentQr: PaymentQr = {
  enabled: false,
  mode: "static",
  payload: "",
  label: "Scan to pay",
};

/** Fill a dynamic QR payload with the amount due and the bill reference. */
export const resolvePaymentQr = (
  qr: PaymentQr | undefined,
  amount: number,
  reference: string,
): string => {
  if (!qr?.enabled || !qr.payload.trim()) return "";
  if (qr.mode === "static") return qr.payload.trim();
  return qr.payload
    .replaceAll("{amount}", r2(amount).toFixed(2))
    .replaceAll("{reference}", reference || "")
    .trim();
};

export const whatsappLink = (number: string) => {
  const digits = (number || "").replace(/[^\d]/g, "");
  return digits ? `https://wa.me/${digits}` : "";
};

/** WhatsApp bill delivery (Meta WhatsApp Cloud API). */
export type WhatsAppSettings = {
  enabled: boolean;
  /** Meta Cloud API phone number id (from the WhatsApp app dashboard) */
  phoneNumberId: string;
  /** short totals only, or every line of the bill */
  format: "summary" | "itemized";
  autoSendOnSale: boolean;
  autoSendOnBooking: boolean;
  /** default country dialling code applied to local member numbers */
  countryCode: string;
  /** intro line above the bill body */
  greeting: string;
  /** sign-off under the bill body */
  signoff: string;
};

export type PromoType = "points" | "foc" | "birthday" | "threshold" | "tier";

export type MemberTier = Member["tier"];

export type TaxMode = "inclusive" | "exclusive";

export type TaxSettings = {
  /** master switch for tax calculation */
  enabled: boolean;
  /** percent, e.g. 5 for 5% */
  rate: number;
  /** "Prices Include Tax" vs "Tax Added at Checkout" */
  mode: TaxMode;
};

export type PaperSize = "80mm" | "58mm" | "a4" | "letter";

export type FontFamilyKey = "mono" | "sans" | "serif";

export type FontStyleSettings = {
  family: FontFamilyKey;
  /** px */
  size: number;
  bold: boolean;
  /** px letter spacing */
  spacing: number;
};

export type ReceiptLinePlacement = "header" | "footer";

export type ReceiptCustomLine = {
  id: string;
  text: string;
  placement: ReceiptLinePlacement;
};

export type ReceiptQrSettings = {
  enabled: boolean;
  value: string;
  /** px */
  size: number;
  placement: ReceiptLinePlacement;
};

export type ReceiptSettings = {
  paper: PaperSize;
  /** business identity printed at the top of every slip */
  companyName: string;
  taxNumber: string;
  regNumber: string;
  phone: string;
  website: string;
  /** store header address / phone block */
  headerText: string;
  /** bottom thank-you note */
  footerText: string;
  showLogo: boolean;
  showPoints: boolean;
  showBarcode: boolean;
  showTax: boolean;
  fonts: {
    header: FontStyleSettings;
    body: FontStyleSettings;
    footer: FontStyleSettings;
  };
  customLines: ReceiptCustomLine[];
  qr: ReceiptQrSettings;
};

/** Fields a single branch may override on top of the global receipt profile. */
export type ReceiptOverride = Partial<
  Pick<
    ReceiptSettings,
    | "companyName"
    | "taxNumber"
    | "regNumber"
    | "phone"
    | "website"
    | "headerText"
    | "footerText"
    | "customLines"
    | "qr"
  >
>;

export type AppSettings = {
  tax: TaxSettings;
  receipt: ReceiptSettings;
  payment: PaymentDetails;
  whatsapp: WhatsAppSettings;
};

export type Promotion = {
  id: string;
  name: string;
  type: PromoType;
  active: boolean;
  /** optional ISO yyyy-mm-dd window */
  startDate?: string;
  endDate?: string;
  /** points policy */
  pointsPerDollar?: number;
  /** foc + threshold: minimum bill amount to trigger */
  minBill?: number;
  /** foc: product handed out for free */
  focProductId?: string;
  /** foc: how many units */
  focQty?: number;
  /** birthday + threshold: discount value */
  value?: number;
  /** how `value` is read (threshold rules only; birthday is always percent) */
  valueType?: DiscountType;
  /** tier rule: percentage discount per membership tier */
  tierRates?: Record<MemberTier, number>;
};
