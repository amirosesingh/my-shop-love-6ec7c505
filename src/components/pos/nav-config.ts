import {
  ArrowLeftRight,
  Boxes,
  Building2,
  Landmark,
  ListPlus,
  MessageCircle,
  MonitorCog,
  MonitorSmartphone,
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
  BarChart3,
  Activity,
  TicketPercent,
  PackageSearch,
} from "lucide-react";

import type { PermissionFlag } from "@/lib/permissions";

export type NavFlag = PermissionFlag;

export type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
  flag?: NavFlag;
  adminOnly?: boolean;
  /** Cloud-only admin tool — hidden in the Windows desktop build. */
  desktopHidden?: boolean;
  search?: Record<string, string>;
  /** Settings page section to expand when this item is opened. */
  section?: string;
  hash?: string;
  keywords?: string;
  /** One-line description shown on the section hub cards. */
  blurb?: string;
};

export type NavGroup = {
  id: string;
  label: string;
  icon: typeof LayoutGrid;
  /** Landing page listing every option in this group. */
  hubTo: string;
  blurb?: string;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  {
    id: "sales",
    label: "Sales & Operations",
    icon: Wallet,
    hubTo: "/sales",
    blurb: "Selling, shifts, bookings and bill history.",
    items: [
      {
        to: "/shifts",
        label: "Shift Management",
        icon: Clock,
        flag: "can_close_shift",
        keywords: "open close drawer z-report",
        blurb: "Open and close the drawer, print the Z-report.",
      },
      {
        to: "/bookings",
        label: "Bookings / Pay Later",
        icon: CalendarClock,
        flag: "can_manage_bookings",
        keywords: "layaway reserve deposit balance due collect",
        blurb: "Deposits, balances due and collections.",
      },
      {
        to: "/display",
        label: "Customer Display",
        icon: MonitorPlay,
        keywords: "second screen customer facing transfer qr",
        blurb: "Second screen facing the customer.",
      },
      {
        to: "/receipts",
        label: "Bill Search & History",
        icon: ScrollText,
        flag: "can_view_sales_reports",
        keywords: "invoice receipt reprint",
        blurb: "Find any past bill and reprint it.",
      },
    ],
  },
  {
    id: "inventory",
    label: "Inventory & Supply",
    icon: Boxes,
    hubTo: "/inventory-hub",
    blurb: "Catalog, purchasing, transfers and locations.",
    items: [
      {
        to: "/inventory",
        label: "Inventory Catalog",
        icon: Boxes,
        flag: "can_view_inventory",
        keywords: "stock products import",
        blurb: "Products, prices, stock counts and bulk import.",
      },
      {
        to: "/all-shops",
        label: "All Shops Panel",
        icon: PackageSearch,
        flag: "can_view_inventory",
        keywords: "group branches multi store stock overview live",
        blurb: "Live takings and stock for every branch in one table.",
      },
      {
        to: "/purchasing",
        label: "Purchasing",
        icon: ScanBarcode,
        flag: "can_receive_purchase_order",
        keywords: "po invoice receiving barcode",
        blurb: "Purchase orders and goods receiving.",
      },
      {
        to: "/transfers",
        label: "Stock Transfers",
        icon: ArrowLeftRight,
        flag: "can_create_transfer",
        keywords: "request move branch",
        blurb: "Move or request stock between branches.",
      },
      {
        to: "/stores",
        label: "Locations / Warehouses",
        icon: Truck,
        desktopHidden: true,
        adminOnly: true,
        flag: "can_manage_locations",
        keywords: "branch store warehouse",
        blurb: "Every storefront and warehouse you operate.",
      },
    ],
  },
  {
    id: "customers",
    label: "Customers & Marketing",
    icon: Users,
    hubTo: "/customers",
    blurb: "Members, loyalty and promotions.",
    items: [
      {
        to: "/members",
        label: "Member Directory",
        icon: Users,
        flag: "can_add_member",
        keywords: "loyalty customer history",
        blurb: "Loyalty members, tiers and purchase history.",
      },
      {
        to: "/promotions",
        label: "Promotions & Discounts",
        icon: Percent,
        adminOnly: true,
        flag: "can_manage_promotions",
        keywords: "foc birthday tier threshold",
        blurb: "FOC items, birthday and threshold offers.",
      },
    ],
  },
  {
    id: "staff",
    label: "Staff & Admin",
    icon: ShieldCheck,
    hubTo: "/admin",
    blurb: "People, permissions and the audit trail.",
    items: [
      {
        to: "/staff",
        label: "Staff Management",
        icon: UserCog,
        desktopHidden: true,
        adminOnly: true,
        flag: "can_manage_staff",
        keywords:
          "employees users roles permissions cashier supervisor pin account matrix duty store",
        blurb: "Accounts, PINs, roles and the permission matrix.",
      },
      {
        to: "/audit",
        label: "Audit Logs & Activity",
        icon: ScanEye,
        adminOnly: true,
        flag: "can_view_audit_trail",
        keywords: "telemetry trail compliance logs sync",
        blurb: "Who did what, when, on which terminal.",
      },
    ],
  },
  {
    id: "reports",
    label: "Reports & Analytics",
    icon: BarChart3,
    hubTo: "/reports",
    blurb: "Sales, coupons, activity and stock reporting.",
    items: [
      {
        to: "/reports",
        label: "Reports Centre",
        icon: BarChart3,
        flag: "can_view_sales_reports",
        keywords: "analytics hub summary",
        blurb: "All reporting in one place.",
      },
      {
        to: "/reports/sales",
        label: "Sales Summary",
        icon: BarChart3,
        flag: "can_view_sales_reports",
        keywords: "revenue tender discount tax cashier",
        blurb: "Revenue, discounts, tax and tender mix.",
      },
      {
        to: "/reports/coupons",
        label: "Coupon Usage",
        icon: TicketPercent,
        flag: "can_view_sales_reports",
        keywords: "coupon promotion discount bill item applied",
        blurb: "Every coupon applied, bill or item level.",
      },
      {
        to: "/reports/activity",
        label: "Register Activity",
        icon: Activity,
        flag: "can_view_sales_reports",
        keywords: "hold resume void split drawer timeline",
        blurb: "Holds, voids, splits and drawer opens in order.",
      },
      {
        to: "/reports/catalog",
        label: "Catalog Changes",
        icon: PackageSearch,
        flag: "can_view_sales_reports",
        keywords: "product price stock history timestamp",
        blurb: "Products added, prices and stock edited.",
      },
      {
        to: "/reports/stock",
        label: "Stock Adjustments",
        icon: PackageSearch,
        flag: "can_view_sales_reports",
        keywords: "stock check calibration variance damage loss shrinkage adjust",
        blurb: "Stock checks, damages, losses and variance.",
      },
    ],
  },
  {
    id: "system",
    label: "System & Settings",
    icon: SettingsIcon,
    hubTo: "/settings",
    blurb: "Every configuration area for this install.",
    items: [
      {
        to: "/settings",
        label: "System & Settings",
        icon: SettingsIcon,
        adminOnly: true,
        flag: "can_access_pos_settings",
        keywords:
          "configuration hub display text size font scaling theme dark light tax vat pricing business identity company name receipt typography extra lines qr elements bank transfer payment whatsapp sync backup terminal activation software updates system health",
        blurb: "Display, tax, receipts, sync, terminals and updates.",
      },
      {
        to: "/promotions",
        label: "Point Rules",
        icon: Sparkles,
        adminOnly: true,
        flag: "can_manage_promotions",
        hash: "points",
        keywords: "loyalty points per dollar policy",
        blurb: "Loyalty points earned per dollar spent.",
      },
    ],
  },
];

export const navItemKey = (i: NavItem) => `${i.to}#${i.hash ?? ""}?${i.section ?? ""}`;

/** Top-level entries pinned above the groups in the sidebar. */
export const standaloneNavItems: NavItem[] = [
  {
    to: "/dashboard",
    label: "Live Dashboard",
    icon: Activity,
    flag: "can_view_dashboard",
    keywords: "revenue profit margin peak hours charts kpi review flags",
    blurb: "Revenue, profit and peak hours as they happen.",
  },
  {
    to: "/",
    label: "Register POS",
    icon: LayoutGrid,
    keywords: "checkout cart sale",
    blurb: "Scan, discount and charge a ticket.",
  },
];
export { Store };
