import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, TicketPercent, Activity, PackageSearch, Scale } from "lucide-react";
import { AppShell } from "@/components/pos/AppShell";

export const Route = createFileRoute("/reports/")({
  head: () => ({
    meta: [
      { title: "Reports & Analytics Centre — Northwind POS" },
      {
        name: "description",
        content:
          "Sales summaries, coupon usage, register activity and catalog change history for every terminal and branch.",
      },
      { property: "og:title", content: "Reports & Analytics Centre — Northwind POS" },
      {
        property: "og:description",
        content: "Every till event, coupon and catalog edit with full timestamps.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsHub,
});

const cards = [
  {
    to: "/reports/sales",
    label: "Sales Summary",
    icon: BarChart3,
    text: "Revenue, discounts, tax and tender mix by day, cashier and branch.",
  },
  {
    to: "/reports/coupons",
    label: "Coupon & Discount Usage",
    icon: TicketPercent,
    text: "Every coupon applied — bill or item level — with the exact item and timestamp.",
  },
  {
    to: "/reports/activity",
    label: "Register Activity Trail",
    icon: Activity,
    text: "Holds, resumes, voids, splits, drawer opens and payments in time order.",
  },
  {
    to: "/reports/catalog",
    label: "Catalog Change History",
    icon: PackageSearch,
    text: "Products added, prices changed and stock edited, with who and when.",
  },
  {
    to: "/reports/stock",
    label: "Stock Adjustments & Calibration",
    icon: Scale,
    text: "Stock checks, damages and losses with the variance, cost impact and reason.",
  },
] as const;

function ReportsHub() {
  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports &amp; Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Every register event is timestamped and traceable back to the person who did it.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((c) => (
            <Link
              key={c.to}
              to={c.to}
              className="group rounded-lg border border-border p-5 transition hover:border-primary"
            >
              <c.icon className="size-5 text-primary" />
              <h2 className="mt-3 text-base font-semibold group-hover:text-primary">{c.label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{c.text}</p>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}