import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Activity,
  Building2,
  Landmark,
  ListPlus,
  EyeOff,
  Globe,
  MessageCircle,
  MonitorCog,
  MonitorSmartphone,
  Smartphone,
  DownloadCloud,
  ArrowLeft,
  Printer,
  QrCode,
  ReceiptText,
  RefreshCw,
  ScanBarcode,
  ShieldCheck,
  Type,
} from "lucide-react";
import { AppShell } from "@/components/pos/AppShell";
import { useAuth } from "@/lib/pos-auth";
import { isDesktop } from "@/lib/branding";

/** Settings live in categories: printer options with printing, messaging with
 *  messaging, and so on — nothing sits in an unrelated page any more. */
const GROUPS = [
  {
    id: "terminal",
    label: "Terminal & display",
    blurb: "How this till looks and stays up to date.",
    pages: [
      {
        to: "/settings/display",
        label: "Display & text size",
        icon: MonitorCog,
        blurb: "Interface scale, density and light / dark theme.",
      },
      {
        to: "/settings/updates",
        label: "Software updates",
        icon: DownloadCloud,
        blurb: "App version, background updates and system health.",
      },
      {
        to: "/settings/terminals",
        label: "Terminal activation",
        icon: MonitorSmartphone,
        blurb: "Register Windows tills, issue and revoke activation codes.",
        cloudOnly: true,
      },
      {
        to: "/settings/mobile-terminals",
        label: "Mobile terminals",
        icon: Smartphone,
        blurb: "Phones and tablets running the POS, managed separately from the tills.",
        cloudOnly: true,
      },
    ],
  },
  {
    id: "printing",
    label: "Printing & receipts",
    blurb: "The printer itself and everything that prints on the slip.",
    pages: [
      {
        to: "/settings/printer",
        label: "Receipt printer",
        icon: Printer,
        blurb: "Device, encoding, margins, drawer pin and a test print.",
      },
      {
        to: "/settings/elements",
        label: "Receipt elements",
        icon: ReceiptText,
        blurb: "Paper size, logo, points, barcode and tax blocks.",
      },
      {
        to: "/settings/type",
        label: "Receipt typography",
        icon: Type,
        blurb: "Fonts, sizes and spacing for printed slips.",
      },
      {
        to: "/settings/lines",
        label: "Receipt extra lines",
        icon: ListPlus,
        blurb: "Policy notes, promotions and opening hours.",
      },
      {
        to: "/settings/qr",
        label: "Receipt QR code",
        icon: QrCode,
        blurb: "QR payload, size and placement on the slip.",
      },
      {
        to: "/settings/booking-slip",
        label: "Booking slip wording",
        icon: ReceiptText,
        blurb: "Terms & conditions and the customer signature line.",
      },
    ],
  },
  {
    id: "business",
    label: "Business & pricing",
    blurb: "Who you are, what you charge and when you trade.",
    pages: [
      {
        to: "/settings/identity",
        label: "Business identity",
        icon: Building2,
        blurb: "Company name, tax numbers, header and footer.",
      },
      {
        to: "/settings/tax",
        label: "Tax & pricing",
        icon: ReceiptText,
        blurb: "Global tax rate and inclusive or exclusive pricing.",
      },
      {
        to: "/settings/rules",
        label: "POS rules & enforcement",
        icon: ShieldCheck,
        blurb: "Shift, discount, refund and terminal security limits.",
      },
      {
        to: "/settings/sku",
        label: "SKU numbering",
        icon: ScanBarcode,
        blurb: "Automatic running-number product codes, or manual entry.",
      },
      {
        to: "/settings/catalog",
        label: "Categories & units",
        icon: ScanBarcode,
        blurb: "Category groups, sub-categories and units of measure.",
      },
      {
        to: "/settings/region",
        label: "Region & time",
        icon: Globe,
        blurb: "Country, time zone, date order and 12 / 24-hour clock.",
      },
    ],
  },
  {
    id: "access",
    label: "Access & visibility",
    blurb: "What each role can see on the busiest screens.",
    pages: [
      {
        to: "/settings/visibility",
        label: "Screen visibility",
        icon: EyeOff,
        blurb: "Hide register actions, payments or cost columns per role.",
      },
    ],
  },
  {
    id: "payments",
    label: "Payments & messaging",
    blurb: "How customers pay and how bills reach them.",
    pages: [
      {
        to: "/settings/payment",
        label: "Bank transfer details",
        icon: Landmark,
        blurb: "Bank account and payment QR for the customer display.",
      },
      {
        to: "/settings/accounts",
        label: "Payment accounts",
        icon: Landmark,
        blurb: "Card machines, bank accounts and e-wallets cashiers can pick at the till.",
      },
      {
        to: "/settings/services",
        label: "Booking services",
        icon: Landmark,
        blurb: "Re-stringing, repairs and other jobs with their default fee.",
      },
      {
        to: "/settings/whatsapp",
        label: "WhatsApp bills",
        icon: MessageCircle,
        blurb: "Send receipts over the WhatsApp Cloud API.",
      },
    ],
  },
  {
    id: "data",
    label: "Data & sync",
    blurb: "Keeping this till in step with the cloud.",
    pages: [
      {
        to: "/settings/sync",
        label: "Sync & backup",
        icon: RefreshCw,
        blurb: "Branch identity, offline sync queue and backups.",
      },
      {
        to: "/settings/system",
        label: "System status & integrations",
        icon: Activity,
        blurb: "Connection health, recovery tools, public domains and approval rules.",
      },
      {
        to: "/settings/security-alerts",
        label: "Security alerts",
        icon: Activity,
        blurb: "Findings from deployment scans and the nightly database posture check.",
      },
      {
        to: "/settings/diagnostics",
        label: "Database health",
        icon: Activity,
        blurb: "Per-table reading and saving status, with the exact reason when one fails.",
      },
      {
        to: "/settings/inheritance",
        label: "Settings inheritance",
        icon: RefreshCw,
        blurb: "Global, cluster and branch tiers with sync, override and push-down controls.",
      },
    ],
  },
] as const;

type SettingsPage = {
  to: string;
  label: string;
  icon: typeof MonitorCog;
  blurb: string;
  cloudOnly?: boolean;
};

const PAGES: SettingsPage[] = GROUPS.flatMap((g) => g.pages as readonly SettingsPage[]);

const LEGACY: Record<string, string> = Object.fromEntries(
  PAGES.map((p) => [p.to.split("/").pop() as string, p.to]),
);

export const Route = createFileRoute("/settings/")({
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["section"] === "string" && search["section"]
      ? { section: search["section"] }
      : {},
  // Older links used /settings?section=tax — send them to the real page.
  beforeLoad: ({ search }) => {
    const section = (search as { section?: string }).section;
    const target = section ? LEGACY[section] : undefined;
    if (target) throw redirect({ to: target });
  },
  head: () => ({
    meta: [
      { title: "System & Settings — Northwind POS" },
      {
        name: "description",
        content:
          "Every POS configuration area in one place: display scaling, tax, receipt design, payment details, WhatsApp bills and offline sync.",
      },
      { property: "og:title", content: "System & Settings — Northwind POS" },
      {
        property: "og:description",
        content: "All register configuration areas for the point of sale.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsHub,
});

function SettingsHub() {
  const { isAdmin, can } = useAuth();
  const allowed = isAdmin || can("can_access_pos_settings");
  const [desktop, setDesktop] = useState(false);
  useEffect(() => setDesktop(isDesktop()), []);
  const groups = GROUPS.map((g) => ({
    ...g,
    pages: (g.pages as readonly SettingsPage[]).filter((p) => !(p.cloudOnly && desktop)),
  })).filter((g) => g.pages.length > 0);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl space-y-5 p-6">
        <div className="sticky top-0 z-20 -mx-6 -mt-6 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
          <Link
            to="/"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to register
          </Link>
        </div>
        <header>
          <h1 className="text-2xl font-semibold">System & settings</h1>
          <p className="text-sm text-muted-foreground">
            Each area opens as its own page, so nothing scrolls out from under you.
          </p>
        </header>

        {!allowed ? (
          <p className="text-sm text-muted-foreground">
            Configuration is managed by an administrator.
          </p>
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <section key={g.id} className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold">{g.label}</h2>
                  <p className="text-xs text-muted-foreground">{g.blurb}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {g.pages.map((p) => (
                    <Link
                      key={p.to}
                      to={p.to as never}
                      className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/60"
                    >
                      <p.icon className="mt-0.5 size-5 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{p.label}</span>
                        <span className="block text-xs text-muted-foreground">{p.blurb}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
