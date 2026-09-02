/**
 * One place for gross profit, so the dashboard and the business report can
 * never drift apart.
 *
 * The wholesale cost is the product's cost price. A line captures that cost at
 * the moment it is sold, so historic bills keep their true margin even after
 * the buying price changes. Exchange credits (negative quantity) subtract from
 * both takings and cost; free-of-charge lines earn nothing but still cost.
 */
import type { CartLine, Product, Sale } from "@/core/types/pos-types";
import { lineUnitDiscount, r2 } from "@/core/types/pos-types";

export type ProfitTotals = {
  /** Takings excluding tax. */
  revenue: number;
  /** Cost of goods sold. */
  cogs: number;
  /** revenue − cogs */
  profit: number;
  /** profit as a percentage of revenue */
  marginPct: number;
};

/** Wholesale cost for one line: the captured cost, else today's cost price. */
export function lineCost(line: CartLine, products: Product[] = []): number {
  const captured = typeof line.cost === "number" ? line.cost : undefined;
  const unit = captured ?? products.find((p) => p.id === line.productId)?.cost ?? 0;
  return r2(unit * line.qty);
}

/** Net selling value of one line, after its own discounts, before tax. */
export function lineRevenue(line: CartLine): number {
  if (line.foc) return 0;
  const unit = line.price - lineUnitDiscount(line);
  return r2(unit * line.qty - (line.couponDiscount ?? 0));
}

/** Gross profit of one line: (selling price − wholesale cost) × quantity. */
export function lineProfit(line: CartLine, products: Product[] = []): number {
  return r2(lineRevenue(line) - lineCost(line, products));
}

/** Roll a set of bills up into revenue, COGS, profit and margin. */
export function profitOf(sales: Sale[], products: Product[] = []): ProfitTotals {
  let revenue = 0;
  let cogs = 0;
  for (const sale of sales) {
    if (sale.refunded) continue;
    for (const line of sale.lines) {
      revenue += lineRevenue(line);
      cogs += lineCost(line, products);
    }
  }
  revenue = r2(revenue);
  cogs = r2(cogs);
  const profit = r2(revenue - cogs);
  return { revenue, cogs, profit, marginPct: revenue > 0 ? (profit / revenue) * 100 : 0 };
}

export type HourlyProfit = { hour: string; revenue: number; cogs: number; profit: number };

/** Revenue and profit per hour of the day, for the trading-pattern chart. */
export function hourlyProfit(sales: Sale[], products: Product[] = []): HourlyProfit[] {
  const hours: HourlyProfit[] = Array.from({ length: 24 }, (_, h) => ({
    hour: `${h}:00`,
    revenue: 0,
    cogs: 0,
    profit: 0,
  }));
  for (const sale of sales) {
    if (sale.refunded) continue;
    const bucket = hours[new Date(sale.createdAt).getHours()];
    if (!bucket) continue;
    for (const line of sale.lines) {
      bucket.revenue += lineRevenue(line);
      bucket.cogs += lineCost(line, products);
    }
  }
  return hours.map((h) => ({
    hour: h.hour,
    revenue: r2(h.revenue),
    cogs: r2(h.cogs),
    profit: r2(h.revenue - h.cogs),
  }));
}
