import type {
  AppSettings,
  PaymentDetails,
  PosState,
  Promotion,
  ReceiptSettings,
  ReviewThresholds,
  Store,
  TradingHours,
  WhatsAppSettings,
} from "./pos-types";
import { defaultPaymentQr } from "./pos-types";

export const defaultPaymentDetails: PaymentDetails = {
  accountName: "",
  bankName: "",
  accountNumber: "",
  whatsapp: "",
  note: "Send the transfer slip on WhatsApp to confirm your booking.",
  showOnBookingSlip: true,
  paymentQr: defaultPaymentQr,
};

export const defaultReceiptSettings: ReceiptSettings = {
  paper: "80mm",
  companyName: "NORTHWIND & CO.",
  taxNumber: "88-2201194",
  regNumber: "",
  phone: "555-0100",
  website: "",
  headerText: "42 Harbour Street, Unit 3\nTel 555-0100 · VAT 88-2201194",
  footerText: "Thank you — see you again soon",
  showLogo: true,
  showPoints: true,
  showBarcode: true,
  showTax: true,
  fonts: {
    header: { family: "mono", size: 15, bold: true, spacing: 2 },
    body: { family: "mono", size: 12, bold: false, spacing: 0 },
    footer: { family: "mono", size: 11, bold: false, spacing: 0 },
  },
  customLines: [],
  qr: { enabled: false, value: "", size: 96, placement: "footer" },
};

export const defaultWhatsApp: WhatsAppSettings = {
  enabled: false,
  phoneNumberId: "",
  format: "summary",
  autoSendOnSale: false,
  autoSendOnBooking: false,
  countryCode: "+1",
  greeting: "Thanks for shopping with us!",
  signoff: "Keep this message as your digital receipt.",
};

/** Daily limits used to flag unusual cashier behaviour for review. */
export const defaultReviewThresholds: ReviewThresholds = {
  maxVoids: 5,
  maxRefunds: 3,
  maxRefundValue: 200,
  maxNoSaleOpens: 5,
  maxDiscountPct: 15,
};

/** Default trading window: 9am to 10pm, 12h shift ceiling, 30min warning. */
export const defaultTradingHours: TradingHours = {
  dayStart: "09:00",
  dayEnd: "22:00",
  maxShiftHours: 12,
  reminderMinutes: 30,
};

/** Public domains and operational switches, editable in System & Integrations. */
export const defaultIntegrations: AppSettings["integrations"] = {
  memberDomain: "https://member.luckycharmsdnbhd.com",
  redeemDomain: "https://redeem.luckycharmsdnbhd.com",
  requireTransferApproval: true,
  autoIssueWelcome: false,
  offlineMode: false,
};

export const defaultSettings: AppSettings = {
  tax: { enabled: true, rate: 5, mode: "exclusive" },
  receipt: defaultReceiptSettings,
  payment: defaultPaymentDetails,
  whatsapp: defaultWhatsApp,
  review: defaultReviewThresholds,
  hours: defaultTradingHours,
  integrations: defaultIntegrations,
  visibility: { hidden: {} },
};

export const seedPromotions: Promotion[] = [
  {
    id: "promo-points",
    name: "Standard point policy",
    type: "points",
    active: true,
    pointsPerDollar: 1,
  },
  {
    id: "promo-birthday",
    name: "Birthday month treat",
    type: "birthday",
    active: true,
    value: 20,
    valueType: "percent",
  },
  {
    id: "promo-foc",
    name: "Free croissant over $100",
    type: "foc",
    active: false,
    minBill: 100,
    focProductId: "p5",
    focQty: 1,
  },
  {
    id: "promo-threshold",
    name: "$10 off bills over $150",
    type: "threshold",
    active: false,
    minBill: 150,
    value: 10,
    valueType: "amount",
  },
  {
    id: "promo-tier",
    name: "Membership tier discount",
    type: "tier",
    active: true,
    tierRates: { Bronze: 5, Silver: 10, Gold: 15 },
  },
];

export const seedStores: Store[] = [
  {
    id: "s1",
    code: "HRB",
    name: "Harbour Street",
    address: "42 Harbour Street, Unit 3",
    phone: "555-0100",
  },
  {
    id: "s2",
    code: "MKT",
    name: "Market Square",
    address: "8 Market Square",
    phone: "555-0121",
  },
  {
    id: "s3",
    code: "APT",
    name: "Airport Kiosk",
    address: "Terminal 2, Gate B",
    phone: "555-0188",
  },
];

const p = (
  id: string,
  name: string,
  category: string,
  price: number,
  cost: number,
  stock: number,
) => ({
  id,
  name,
  sku: `SKU-${id.toUpperCase()}`,
  barcode: `20${id.replace(/\D/g, "").padStart(10, "0")}`,
  category,
  price,
  cost,
  stockByStore: {
    s1: stock,
    s2: Math.round(stock * 0.6),
    s3: Math.round(stock * 0.25),
  } as Record<string, number>,
  reorderLevel: 10,
  taxRate: 0.05,
});

export const seedState: PosState = {
  stores: seedStores,
  currentStoreId: "s1",
  counter: 1042,
  transferCounter: 24,
  bookingCounter: 0,
  transfers: [],
  bookings: [],
  promotions: seedPromotions,
  settings: defaultSettings,
  products: [
    p("p1", "Espresso Beans 250g", "Coffee", 12.5, 7.2, 34),
    p("p2", "Cold Brew Can", "Coffee", 4.25, 2.1, 120),
    p("p3", "Oat Milk 1L", "Dairy", 3.4, 1.8, 8),
    p("p4", "Ceramic Mug", "Merch", 14.0, 6.0, 22),
    p("p5", "Butter Croissant", "Bakery", 3.75, 1.2, 45),
    p("p6", "Almond Danish", "Bakery", 4.5, 1.6, 18),
    p("p7", "Matcha Tin 100g", "Tea", 18.9, 9.4, 12),
    p("p8", "Chai Concentrate", "Tea", 9.6, 4.3, 5),
    p("p9", "Tote Bag", "Merch", 16.0, 5.5, 30),
    p("p10", "Sparkling Water", "Drinks", 2.2, 0.8, 200),
    p("p11", "Dark Chocolate Bar", "Snacks", 5.1, 2.3, 60),
    p("p12", "Granola Pouch", "Snacks", 7.8, 3.1, 26),
    p("p13", "Pour-Over Filter x50", "Merch", 8.4, 3.0, 40),
    p("p14", "Banana Bread Slice", "Bakery", 4.2, 1.4, 15),
    p("p15", "Single Origin 1kg", "Coffee", 38.0, 21.0, 9),
  ],
  members: [
    {
      id: "m1",
      code: "MB-1001",
      name: "Amara Okafor",
      phone: "555-0142",
      email: "amara@example.com",
      tier: "Gold",
      points: 1840,
      totalSpend: 1840.5,
      joinedAt: "2024-03-11",
      homeStoreId: "s1",
      birthday: "1991-07-14",
    },
    {
      id: "m2",
      code: "MB-1002",
      name: "Lars Pettersen",
      phone: "555-0199",
      email: "lars@example.com",
      tier: "Silver",
      points: 620,
      totalSpend: 620.0,
      joinedAt: "2024-09-02",
      homeStoreId: "s2",
      birthday: "1988-03-02",
    },
    {
      id: "m3",
      code: "MB-1003",
      name: "Rina Takahashi",
      phone: "555-0177",
      email: "rina@example.com",
      tier: "Bronze",
      points: 145,
      totalSpend: 145.25,
      joinedAt: "2025-01-20",
      homeStoreId: "s3",
      birthday: "1996-11-23",
    },
  ],
  sales: [],
  shifts: [],
};
