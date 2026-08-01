import {
  ArrowLeftRight,
  Boxes,
  Building2,
  Landmark,
  ListPlus,
  MessageCircle,
  MonitorCog,
  QrCode,
  RefreshCw,
  Type,
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
  /** Settings page section to expand when this item is opened. */
  section?: string;
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
      { to: "/settings", label: "Display & Text Size", icon: MonitorCog, adminOnly: true, flag: "can_access_pos_settings", section: "display", keywords: "font size scaling zoom theme dark light density" },
      { to: "/settings", label: "Tax & Pricing", icon: ReceiptText, adminOnly: true, flag: "can_access_pos_settings", section: "tax", keywords: "vat rate inclusive" },
      { to: "/settings", label: "Business Identity", icon: Building2, adminOnly: true, flag: "can_access_pos_settings", section: "identity", keywords: "company name logo tax number registration phone website" },
      { to: "/settings", label: "Receipt Typography", icon: Type, adminOnly: true, flag: "can_access_pos_settings", section: "type", keywords: "font header body footer size bold paper 80mm 58mm a4" },
      { to: "/settings", label: "Receipt Extra Lines", icon: ListPlus, adminOnly: true, flag: "can_access_pos_settings", section: "lines", keywords: "custom line note terms" },
      { to: "/settings", label: "Receipt QR Code", icon: QrCode, adminOnly: true, flag: "can_access_pos_settings", section: "qr", keywords: "qr barcode link placement" },
      { to: "/settings", label: "Receipt Elements", icon: Printer, adminOnly: true, flag: "can_access_pos_settings", section: "elements", keywords: "logo points barcode tax toggles" },
      { to: "/settings", label: "Bank Transfer Details", icon: Landmark, adminOnly: true, flag: "can_access_pos_settings", section: "payment", keywords: "bank account iban qr payment transfer" },
      { to: "/settings", label: "WhatsApp Bills", icon: MessageCircle, adminOnly: true, flag: "can_access_pos_settings", section: "whatsapp", keywords: "whatsapp send bill api token" },
      { to: "/settings", label: "Sync & Backup", icon: RefreshCw, adminOnly: true, flag: "can_access_pos_settings", section: "sync", keywords: "offline outbox backup sql local database" },
      { to: "/promotions", label: "Point Rules", icon: Sparkles, adminOnly: true, flag: "can_access_pos_settings", hash: "points", keywords: "loyalty points per dollar policy" },
    ],
  },
];

export const navItemKey = (i: NavItem) => `${i.to}#${i.hash ?? ""}?${i.section ?? ""}`;
export { Store };
