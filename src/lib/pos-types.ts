export type Store = {
  id: string;
  code: string;
  name: string;
  address: string;
  phone: string;
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
};

export type DiscountType = "amount" | "percent";

/** Round to cents without float drift. */
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Resolve a cart line's per-unit discount in currency. */
export const lineUnitDiscount = (l: Pick<CartLine, "price" | "discount" | "discountType">) =>
  l.discountType === "percent"
    ? r2((l.price * (l.discount || 0)) / 100)
    : r2(l.discount || 0);

export type PaymentMethod = "cash" | "card" | "wallet" | "points";

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
export type TransferStatus =
  | "requested"
  | "in_transit"
  | "received"
  | "rejected"
  | "cancelled";

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
  counter: number;
  transferCounter: number;
  settings: AppSettings;
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

export type ReceiptSettings = {
  paper: PaperSize;
  /** store header address / phone block */
  headerText: string;
  /** bottom thank-you note */
  footerText: string;
  showLogo: boolean;
  showPoints: boolean;
  showBarcode: boolean;
  showTax: boolean;
};

export type AppSettings = {
  tax: TaxSettings;
  receipt: ReceiptSettings;
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
