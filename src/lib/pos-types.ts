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
};

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
