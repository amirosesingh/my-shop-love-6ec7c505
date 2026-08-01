import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  Building2,
  Landmark,
  ListPlus,
  MessageCircle,
  MonitorCog,
  Printer,
  QrCode,
  ReceiptText,
  RefreshCw,
  Type,
} from "lucide-react";
import { AppShell } from "@/components/pos/AppShell";
import { useAuth } from "@/lib/pos-auth";

const PAGES = [
  { to: "/settings/display", label: "Display & text size", icon: MonitorCog, blurb: "Interface scale, density and light / dark theme." },
  { to: "/settings/tax", label: "Tax & pricing", icon: ReceiptText, blurb: "Global tax rate and inclusive or exclusive pricing." },
  { to: "/settings/identity", label: "Business identity", icon: Building2, blurb: "Company name, tax numbers, header and footer." },
  { to: "/settings/type", label: "Receipt typography", icon: Type, blurb: "Fonts, sizes and spacing for printed slips." },
  { to: "/settings/lines", label: "Receipt extra lines", icon: ListPlus, blurb: "Policy notes, promotions and opening hours." },
  { to: "/settings/qr", label: "Receipt QR code", icon: QrCode, blurb: "QR payload, size and placement on the slip." },
  { to: "/settings/elements", label: "Receipt elements", icon: Printer, blurb: "Paper size, logo, points, barcode and tax blocks." },
  { to: "/settings/payment", label: "Bank transfer details", icon: Landmark, blurb: "Bank account and payment QR for the customer display." },
  { to: "/settings/whatsapp", label: "WhatsApp bills", icon: MessageCircle, blurb: "Send receipts over the WhatsApp Cloud API." },
  { to: "/settings/sync", label: "Sync & backup", icon: RefreshCw, blurb: "Branch identity, offline sync queue and backups." },
] as const;

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
    const target = "section" in search ? LEGACY[search.section] : undefined;
    if (target) throw redirect({ to: target });
  },
  head: () => ({
    meta: [
      { title: "System & Settings — Northwind POS" },
      { name: "description", content: "Every POS configuration area in one place: display scaling, tax, receipt design, payment details, WhatsApp bills and offline sync." },
      { property: "og:title", content: "System & Settings — Northwind POS" },
      { property: "og:description", content: "All register configuration areas for the point of sale." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsHub,
});

function SettingsHub() {
  const { isAdmin, can } = useAuth();
  const allowed = isAdmin || can("can_access_pos_settings");

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl space-y-5 p-6">
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
          <div className="grid gap-3 sm:grid-cols-2">
            {PAGES.map((p) => (
              <Link
                key={p.to}
                to={p.to}
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
        )}
      </div>
    </AppShell>
  );
}
