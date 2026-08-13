/**
 * Feature Component Hub — the catalogue of atomic register elements an
 * administrator can place on the till canvas. Every entry is a single control,
 * badge, input or list that already exists on the register; the register route
 * supplies the live JSX for it, so each click handler, permission gate and
 * state binding keeps working wherever the node is dropped.
 */
export type RegisterModuleId =
  // action buttons
  | "actClear"
  | "actHold"
  | "actBookLater"
  | "actBooking"
  | "actExchange"
  | "actVoid"
  | "actCoupon"
  | "actSplit"
  | "actDrawer"
  | "actCharge"
  // inputs & displays
  | "scanBar"
  | "memberSearch"
  | "billNumber"
  | "shiftBadge"
  | "cartLines"
  | "totalsBlock"
  | "balanceDue"
  | "heldList"
  | "receiptToggle"
  | "reprintDeck"
  // catalog
  | "catalog";

export type RegisterModuleCategory = "Action buttons" | "Inputs & displays" | "Catalog";

export const REGISTER_CATEGORIES: RegisterModuleCategory[] = [
  "Action buttons",
  "Inputs & displays",
  "Catalog",
];

export type RegisterModule = {
  id: RegisterModuleId;
  label: string;
  blurb: string;
  category: RegisterModuleCategory;
  /** Default box on the 24-column canvas. */
  w: number;
  h: number;
  minW: number;
  minH: number;
  /** Removing these leaves the till unable to take money — warn first. */
  essential?: boolean;
  /** "bare" nodes render with no surface so the canvas stays seamless. */
  chrome?: "bare" | "panel";
  /** Supports the grid / list display option. */
  supportsView?: boolean;
  /** Supports a custom text label. */
  supportsLabel?: boolean;
};

const bare = (
  id: RegisterModuleId,
  label: string,
  blurb: string,
  category: RegisterModuleCategory,
  w: number,
  h: number,
  extra: Partial<RegisterModule> = {},
): RegisterModule => ({
  id,
  label,
  blurb,
  category,
  w,
  h,
  // Bare controls can shrink to a single grid cell for icon-only tiles.
  minW: 1,
  minH: 1,
  chrome: "bare",
  supportsLabel: true,
  ...extra,
});

export const REGISTER_MODULES: RegisterModule[] = [
  bare("actCharge", "Charge / pay button", "Opens the payment deck for the balance due.", "Action buttons", 8, 3, {
    essential: true,
  }),
  bare("actBookLater", "Book & pay later", "Parks the bill as a booking with a deposit.", "Action buttons", 8, 3),
  bare(
    "actBooking",
    "Create / manage booking",
    "Always-on booking hub: racket service specs or a standard reservation.",
    "Action buttons",
    8,
    3,
    { essential: true },
  ),
  bare("actClear", "Clear bill", "Empties the current bill.", "Action buttons", 3, 3),
  bare("actHold", "Hold order", "Parks the bill so another can be served.", "Action buttons", 6, 3),
  bare("actVoid", "Void cart", "Voids the whole bill with an audit entry.", "Action buttons", 6, 3),
  bare("actExchange", "Exchange / return", "Starts an exchange against an earlier bill.", "Action buttons", 3, 3),
  bare("actCoupon", "Apply coupon", "Opens the coupon and voucher picker.", "Action buttons", 6, 3),
  bare("actSplit", "Split bill", "Splits the balance across tenders.", "Action buttons", 6, 3),
  bare("actDrawer", "Open cash drawer", "PIN-gated no-sale drawer kick.", "Action buttons", 6, 3),

  bare("scanBar", "Barcode / SKU input", "Scan or key a code straight onto the bill.", "Inputs & displays", 8, 4, {
    supportsLabel: false,
  }),
  bare("memberSearch", "Member search & enrol", "Attach a loyalty member or add a new one.", "Inputs & displays", 8, 8, {
    supportsLabel: false,
    minH: 4,
  }),
  bare("billNumber", "Bill number", "The permanent number of the bill in progress.", "Inputs & displays", 5, 3),
  bare("shiftBadge", "Shift status badge", "Who is on shift, or that the till is closed.", "Inputs & displays", 3, 3, {
    supportsLabel: false,
  }),
  {
    id: "cartLines",
    label: "Live receipt / cart list",
    blurb: "The scrolling list of items on the current bill.",
    category: "Inputs & displays",
    w: 8,
    h: 12,
    minW: 4,
    minH: 4,
    essential: true,
    chrome: "panel",
  },
  bare("totalsBlock", "Totals & discounts", "Subtotal, discounts, promotions and tax.", "Inputs & displays", 8, 8, {
    supportsLabel: false,
    minH: 3,
  }),
  bare("balanceDue", "Balance due display", "The large amount owed or refundable.", "Inputs & displays", 8, 3),
  bare("heldList", "Held bills list", "Resume any bill parked on this till.", "Inputs & displays", 6, 6, {
    supportsLabel: false,
  }),
  bare("receiptToggle", "Live receipt preview toggle", "Shows the receipt overlay while ringing.", "Inputs & displays", 6, 3, {
    supportsLabel: false,
  }),
  bare("reprintDeck", "Reprint & send last bill", "Reprint, gift, kitchen copy and WhatsApp.", "Inputs & displays", 6, 4, {
    supportsLabel: false,
  }),

  {
    id: "catalog",
    label: "Product catalog & shift deck",
    blurb: "Search & add products, racket booking, shift open/close.",
    category: "Catalog",
    w: 10,
    h: 34,
    minW: 5,
    minH: 6,
    chrome: "panel",
    supportsView: true,
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

/** v1 coarse blocks expand into their atomic children on first load. */
export const LEGACY_EXPANSION: Record<string, RegisterModuleId[]> = {
  catalog: ["catalog"],
  billHeader: ["billNumber", "shiftBadge", "actExchange", "actClear"],
  scanBar: ["scanBar"],
  memberSearch: ["memberSearch"],
  cartLines: ["cartLines"],
  billFooter: ["totalsBlock", "balanceDue", "actCharge", "actBooking", "actBookLater", "reprintDeck"],
  transactionActions: ["actHold", "actVoid", "actCoupon", "actSplit", "heldList"],
  devicePrinting: ["actDrawer", "receiptToggle"],
};
