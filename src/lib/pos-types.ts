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
  counter: number;
  transferCounter: number;
};
