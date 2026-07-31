export type Product = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
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
  cashier: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: number;
  countedCash: number | null;
  note: string;
};

export type PosState = {
  products: Product[];
  members: Member[];
  sales: Sale[];
  shifts: Shift[];
  counter: number;
};