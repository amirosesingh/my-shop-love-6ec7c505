import {
  ArrowLeftRight,
  Boxes,
  CalendarClock,
  Clock,
  LayoutGrid,
  MonitorPlay,
  Percent,
  Printer,
  ReceiptText,
  ScanBarcode,
  ScanEye,
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

import type { PermissionFlag } from "@/lib/permissions";

export type NavFlag = PermissionFlag;

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
      { to: "/shifts", label: "Shift Management", icon: Clock, flag: "can_view_sales_reports", keywords: "open close drawer z-report" },
      { to: "/bookings", label: "Bookings / Pay Later", icon: CalendarClock, keywords: "layaway reserve deposit balance due collect" },
      { to: "/display", label: "Customer Display", icon: MonitorPlay, keywords: "second screen customer facing transfer qr" },
      { to: "/receipts", label: "Bill Search & History", icon: ScrollText, flag: "can_view_sales_reports", keywords: "invoice receipt reprint" },
    ],
  },
  {
    id: "inventory",
    label: "Inventory & Supply",
    icon: Boxes,
    items: [
      { to: "/inventory", label: "Inventory Catalog", icon: Boxes, flag: "can_view_inventory", keywords: "stock products import" },
      { to: "/purchasing", label: "Purchasing", icon: ScanBarcode, flag: "can_receive_purchase_order", keywords: "po invoice receiving barcode" },
      { to: "/transfers", label: "Stock Transfers", icon: ArrowLeftRight, keywords: "request move branch" },
      { to: "/stores", label: "Locations / Warehouses", icon: Truck, adminOnly: true, flag: "can_view_inventory", keywords: "branch store warehouse" },
    ],
  },
  {
    id: "customers",
    label: "Customers & Marketing",
    icon: Users,
    items: [
      { to: "/members", label: "Member Directory", icon: Users, keywords: "loyalty customer history" },
      { to: "/promotions", label: "Promotions & Discounts", icon: Percent, adminOnly: true, flag: "can_access_pos_settings", keywords: "foc birthday tier threshold" },
    ],
  },
  {
    id: "staff",
    label: "Staff & Admin",
    icon: ShieldCheck,
    items: [
      { to: "/staff", label: "Staff Management", icon: UserCog, adminOnly: true, flag: "can_manage_staff", keywords: "employees users roles permissions cashier supervisor pin account matrix duty store" },
      { to: "/audit", label: "Audit Logs & Activity", icon: ScanEye, adminOnly: true, flag: "can_view_sales_reports", keywords: "telemetry trail compliance logs sync" },
    ],
  },
  {
    id: "system",
    label: "System & Settings",
    icon: SettingsIcon,
    items: [
      { to: "/settings", label: "Tax & Pricing", icon: ReceiptText, adminOnly: true, flag: "can_access_pos_settings", keywords: "vat rate inclusive" },
      { to: "/settings", label: "Receipt / Print Customizer", icon: Printer, adminOnly: true, flag: "can_access_pos_settings", hash: "receipt", keywords: "80mm 58mm a4 header footer" },
      { to: "/promotions", label: "Point Rules", icon: Sparkles, adminOnly: true, flag: "can_access_pos_settings", hash: "points", keywords: "loyalty points per dollar policy" },
    ],
  },
];

export const navItemKey = (i: NavItem) => `${i.to}#${i.hash ?? ""}`;
export { Store };
