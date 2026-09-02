/**
 * One shared margin engine so the item report and the analytics board can
 * never disagree on revenue, cost or profit.
 */
import { lineUnitDiscount, r2, type CartLine, type Product, type Sale } from "@/core/types/pos-types";

export type SoldLine = {
  saleId: string;
  receiptNo: string;
  createdAt: string;
  storeId: string;
  cashier: string;
  productId: string;
  name: string;
  sku: string;
  barcode: string;
  unit: string;
  category: string;
  qty: number;
  price: number;
  unitDiscount: number;
  discount: number;
  taxRate: number;
  tax: number;
  revenue: number;
  unitCost: number;
  cost: number;
  profit: number;
  marginPct: number;
  /** true when the cost came from the product record, not the bill */
  estimatedCost: boolean;
  credit: boolean;
  foc: boolean;
};

const lineOf = (
  s: Sale,
  l: CartLine,
  products: Product[],
): SoldLine => {
  const p = products.find((x) => x.id === l.productId);
  const unitDiscount = lineUnitDiscount(l);
  const net = Math.max(l.price - unitDiscount, 0);
  const revenue = r2(net * l.qty - (l.couponDiscount ?? 0));
  const estimatedCost = l.cost == null;
  const unitCost = l.cost ?? p?.cost ?? 0;
  const cost = r2(unitCost * l.qty);
  const profit = r2(revenue - cost);
  return {
    saleId: s.id,
    receiptNo: s.receiptNo,
    createdAt: s.createdAt,
    storeId: s.storeId,
    cashier: s.cashier,
    productId: l.productId,
    name: l.name,
    sku: p?.sku ?? "",
    barcode: p?.barcode ?? "",
    unit: p?.unit ?? "",
    category: p?.category ?? "",
    qty: l.qty,
    price: l.price,
    unitDiscount,
    discount: r2(unitDiscount * l.qty + (l.couponDiscount ?? 0)),
    taxRate: l.taxRate ?? 0,
    tax: r2((revenue * (l.taxRate ?? 0)) / 100),
    revenue,
    unitCost,
    cost,
    profit,
    marginPct: revenue ? r2((profit / revenue) * 100) : 0,
    estimatedCost,
    credit: !!l.credit,
    foc: !!l.foc,
  };
};

/** Flatten every bill in the window into one row per sold line. */
export const soldLines = (sales: Sale[], products: Product[]): SoldLine[] =>
  sales.flatMap((s) => s.lines.map((l) => lineOf(s, l, products)));

export const sumLines = (rows: SoldLine[]) => {
  const revenue = r2(rows.reduce((a, r) => a + r.revenue, 0));
  const cost = r2(rows.reduce((a, r) => a + r.cost, 0));
  const profit = r2(revenue - cost);
  return {
    lines: rows.length,
    units: r2(rows.reduce((a, r) => a + r.qty, 0)),
    revenue,
    cost,
    profit,
    discount: r2(rows.reduce((a, r) => a + r.discount, 0)),
    marginPct: revenue ? r2((profit / revenue) * 100) : 0,
  };
};

/** Everything the shop gave away on a set of bills. */
export const savingsOf = (sales: Sale[], rows: SoldLine[]) => {
  const lineDiscount = r2(rows.filter((r) => !r.foc).reduce((a, r) => a + r.discount, 0));
  const focValue = r2(rows.filter((r) => r.foc).reduce((a, r) => a + r.price * r.qty, 0));
  const coupon = r2(sales.reduce((a, s) => a + (s.couponDiscount ?? 0), 0));
  const billDiscount = r2(
    Math.max(sales.reduce((a, s) => a + s.discount, 0) - lineDiscount - coupon, 0),
  );
  return {
    lineDiscount,
    billDiscount,
    coupon,
    focValue,
    total: r2(lineDiscount + billDiscount + coupon + focValue),
  };
};