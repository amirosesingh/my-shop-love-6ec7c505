/**
 * Feature Component Hub — the catalogue of register modules an administrator
 * can place on the till canvas. Each entry describes a control that already
 * exists on the register; the register route supplies the live JSX for it, so
 * every click handler, permission gate and state binding keeps working
 * wherever the block is dropped.
 */
export type RegisterModuleId =
  | "catalog"
  | "billHeader"
  | "scanBar"
  | "memberSearch"
  | "cartLines"
  | "billFooter"
  | "transactionActions"
  | "devicePrinting";

export type RegisterModuleCategory =
  | "Sales & Cart"
  | "Transaction actions"
  | "Catalog & search"
  | "Customer & staff";

export const REGISTER_CATEGORIES: RegisterModuleCategory[] = [
  "Sales & Cart",
  "Transaction actions",
  "Catalog & search",
  "Customer & staff",
];

export type RegisterModule = {
  id: RegisterModuleId;
  label: string;
  blurb: string;
  category: RegisterModuleCategory;
  /** Default box on the 12-column canvas. */
  w: number;
  h: number;
  minW: number;
  minH: number;
  /** Removing these leaves the till unable to take money — warn first. */
  essential?: boolean;
  /** Supports the grid / list + font size display options. */
  hasDisplayOptions?: boolean;
};

export const REGISTER_MODULES: RegisterModule[] = [
  {
    id: "cartLines",
    label: "Live receipt / cart panel",
    blurb: "The scrolling list of items on the current bill.",
    category: "Sales & Cart",
    w: 4,
    h: 12,
    minW: 3,
    minH: 6,
    essential: true,
  },
  {
    id: "billHeader",
    label: "Current bill header",
    blurb: "Bill number, shift badge, exchange and clear.",
    category: "Sales & Cart",
    w: 4,
    h: 4,
    minW: 3,
    minH: 3,
  },
  {
    id: "scanBar",
    label: "Barcode / SKU scanner bar",
    blurb: "Scan or key a code straight onto the bill.",
    category: "Sales & Cart",
    w: 4,
    h: 3,
    minW: 2,
    minH: 2,
  },
  {
    id: "billFooter",
    label: "Totals, discounts & charge",
    blurb: "Subtotal breakdown, promotions, charge and book-later buttons.",
    category: "Sales & Cart",
    w: 4,
    h: 12,
    minW: 3,
    minH: 6,
    essential: true,
  },
  {
    id: "transactionActions",
    label: "Transaction actions",
    blurb: "Hold, void, coupon, split bill and held-bill list.",
    category: "Transaction actions",
    w: 3,
    h: 10,
    minW: 2,
    minH: 4,
  },
  {
    id: "devicePrinting",
    label: "Cash drawer & printing",
    blurb: "Open the drawer and toggle the live receipt preview.",
    category: "Transaction actions",
    w: 3,
    h: 6,
    minW: 2,
    minH: 3,
  },
  {
    id: "catalog",
    label: "Product catalog & shift deck",
    blurb: "Search & add products, racket booking, shift open/close.",
    category: "Catalog & search",
    w: 5,
    h: 16,
    minW: 3,
    minH: 6,
    hasDisplayOptions: true,
  },
  {
    id: "memberSearch",
    label: "Member search & enrol",
    blurb: "Attach a loyalty member, view history or add a new one.",
    category: "Customer & staff",
    w: 4,
    h: 6,
    minW: 2,
    minH: 3,
  },
];

export const MODULE_BY_ID: Record<RegisterModuleId, RegisterModule> = REGISTER_MODULES.reduce(
  (acc, m) => {
    acc[m.id] = m;
    return acc;
  },
  {} as Record<RegisterModuleId, RegisterModule>,
);

export const isRegisterModuleId = (v: string): v is RegisterModuleId => v in MODULE_BY_ID;