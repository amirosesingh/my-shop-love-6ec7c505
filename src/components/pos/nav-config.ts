import {
  ArrowLeftRight,
  Boxes,
  Clock,
  LayoutGrid,
  Percent,
  Printer,
  ReceiptText,
  ScanBarcode,
  ScrollText,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  Users,
  UserCog,
  Wallet,
} from "lucide-react";

export type NavFlag = "financials" | "products" | "ecommerce";

export type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
  flag?: NavFlag;
  adminOnly?: boolean;
  search?: Record<string, string>;
  hash?: string;
  keywords?: string;
};

export type NavGroup = {
  id: string;
  label: string;
  icon: typeof LayoutGrid;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  {
    id: "sales",
    label: "Sales & Operations",
    icon: Wallet,
    items: [
      { to: "/", label: "Register POS", icon: LayoutGrid, keywords: "checkout cart sale" },
      { to: "/shifts", label: "Shift Management", icon: Clock, flag: "financials", keywords: "open close drawer z-report" },
      { to: "/receipts", label: "Bill Search & History", icon: ScrollText, flag: "financials", keywords: "invoice receipt reprint" },
    ],
  },
  {
    id: "inventory",
    label: "Inventory & Supply",
    icon: Boxes,
    items: [
      { to: "/inventory", label: "Inventory Catalog", icon: Boxes, keywords: "stock products import" },
      { to: "/purchasing", label: "Purchasing", icon: ScanBarcode, flag: "products", keywords: "po invoice receiving barcode" },
      { to: "/transfers", label: "Stock Transfers", icon: ArrowLeftRight, keywords: "request move branch" },
      { to: "/stores", label: "Locations / Warehouses", icon: Truck, adminOnly: true, keywords: "branch store warehouse" },
    ],
  },
  {
    id: "customers",
    label: "Customers & Marketing",
    icon: Users,
    items: [
      { to: "/members", label: "Member Directory", icon: Users, keywords: "loyalty customer history" },
      { to: "/promotions", label: "Promotions & Discounts", icon: Percent, adminOnly: true, keywords: "foc birthday tier threshold" },
    ],
  },
  {
    id: "staff",
    label: "Staff & Admin",
    icon: ShieldCheck,
    items: [
      { to: "/staff", label: "Staff Profiles", icon: UserCog, adminOnly: true, keywords: "employees duty store assignment" },
      { to: "/staff", label: "User Roles & Permissions", icon: ShieldCheck, adminOnly: true, hash: "permissions", keywords: "flags toggles access matrix" },
    ],
  },
  {
    id: "system",
    label: "System & Settings",
    icon: SettingsIcon,
    items: [
      { to: "/settings", label: "Tax & Pricing", icon: ReceiptText, adminOnly: true, keywords: "vat rate inclusive" },
      { to: "/settings", label: "Receipt / Print Customizer", icon: Printer, adminOnly: true, hash: "receipt", keywords: "80mm 58mm a4 header footer" },
      { to: "/promotions", label: "Point Rules", icon: Sparkles, adminOnly: true, hash: "points", keywords: "loyalty points per dollar policy" },
    ],
  },
];

export const navItemKey = (i: NavItem) => `${i.to}#${i.hash ?? ""}`;
export { Store };
