import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Percent, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePos } from "@/lib/pos-store";
import { useAuth } from "@/lib/pos-auth";
import {
  PAPER_LABELS,
  paperCss,
  resolveReceiptCfg,
  saleReceiptPreview,
  setPreviewReceiptCfg,
  setPrintSettings,
} from "@/lib/pos-print";
import type {
  FontFamilyKey,
  FontStyleSettings,
  PaperSize,
  ReceiptCustomLine,
  ReceiptOverride,
  ReceiptSettings,
  Sale,
  TaxMode,
} from "@/lib/pos-types";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Tax & Receipt Settings — Northwind POS" },
      {
        name: "description",
        content:
          "Control global tax rate and mode, and customise printed receipt paper size, header, footer and slip elements with a live preview.",
      },
      { property: "og:title", content: "Tax & Receipt Settings — Northwind POS" },
      {
        property: "og:description",
        content: "Global tax controls and a live receipt & slip customizer.",
      },
    ],
  }),
  component: Settings,
});

const TOGGLES: { key: keyof ReceiptSettings; label: string }[] = [
  { key: "showLogo", label: "Store logo" },
  { key: "showPoints", label: "Member points balance" },
  { key: "showBarcode", label: "Barcode" },
  { key: "showTax", label: "Tax details" },
];

const FONT_SCOPES: { key: keyof ReceiptSettings["fonts"]; label: string }[] = [
  { key: "header", label: "Header" },
  { key: "body", label: "Body" },
  { key: "footer", label: "Footer" },
];

const FAMILIES: { key: FontFamilyKey; label: string }[] = [
  { key: "mono", label: "Monospace" },
  { key: "sans", label: "Sans" },
  { key: "serif", label: "Serif" },
];

const IDENTITY_FIELDS: { key: keyof ReceiptOverride; label: string; placeholder: string }[] = [
  { key: "companyName", label: "Company name", placeholder: "NORTHWIND & CO." },
  { key: "taxNumber", label: "Tax / VAT number", placeholder: "88-2201194" },
  { key: "regNumber", label: "Registration number", placeholder: "REG-000123" },
  { key: "phone", label: "Phone", placeholder: "555-0100" },
  { key: "website", label: "Website", placeholder: "www.example.com" },
];

function Settings() {
  const { state, stores, currentStore, updateSettings, upsertStore } = usePos();
  const { isAdmin, can } = useAuth();
  const canSettings = isAdmin || can("can_access_pos_settings");
  const { tax, receipt } = state.settings;

  const [branchId, setBranchId] = useState(currentStore.id);
  const branch = stores.find((s) => s.id === branchId) ?? currentStore;
  const overrideOn = !!branch.receiptOverrides;
  /** what the printer will actually use for the branch being edited */
  const effective = useMemo(
    () => resolveReceiptCfg(receipt, overrideOn ? branch : null),
    [receipt, branch, overrideOn],
  );

  /** Writes branch-overridable fields to the branch when override mode is on. */
  const setField = <K extends keyof ReceiptOverride>(key: K, value: ReceiptOverride[K]) => {
    if (overrideOn) {
      upsertStore({ ...branch, receiptOverrides: { ...branch.receiptOverrides, [key]: value } });
    } else {
      updateSettings({ receipt: { ...receipt, [key]: value } as ReceiptSettings });
    }
  };

  const setGlobal = (patch: Partial<ReceiptSettings>) =>
    updateSettings({ receipt: { ...receipt, ...patch } });

  const setFont = (scope: keyof ReceiptSettings["fonts"], patch: Partial<FontStyleSettings>) =>
    setGlobal({ fonts: { ...receipt.fonts, [scope]: { ...receipt.fonts[scope], ...patch } } });

  const toggleOverride = (on: boolean) =>
    upsertStore({
      ...branch,
      receiptOverrides: on
        ? {
            companyName: receipt.companyName,
            headerText: receipt.headerText,
            footerText: receipt.footerText,
          }
        : undefined,
    });

  const sample: Sale = useMemo(() => {
    const lines = [
      { productId: "x1", name: "Espresso Beans 250g", price: 12.5, qty: 2, taxRate: 0.05, discount: 0 },
      { productId: "x2", name: "Butter Croissant", price: 3.75, qty: 1, taxRate: 0.05, discount: 0 },
    ];
    const subtotal = 28.75;
    const rate = tax.enabled ? tax.rate / 100 : 0;
    const taxAmount = tax.enabled
      ? tax.mode === "inclusive"
        ? Number((subtotal - subtotal / (1 + rate)).toFixed(2))
        : Number((subtotal * rate).toFixed(2))
      : 0;
    const total = tax.enabled && tax.mode === "exclusive" ? Number((subtotal + taxAmount).toFixed(2)) : subtotal;
    return {
      id: "preview",
      receiptNo: `${currentStore.code}-000001`,
      storeId: currentStore.id,
      shiftId: "preview",
      lines,
      subtotal,
      discount: 0,
      tax: taxAmount,
      total,
      paid: total,
      change: 0,
      method: "cash",
      memberId: "m1",
      pointsEarned: Math.round(total),
      cashier: "Preview",
      createdAt: new Date().toISOString(),
    };
  }, [tax, currentStore]);

  const previewHtml = useMemo(() => {
    setPreviewReceiptCfg(effective, tax);
    return saleReceiptPreview(
      sample,
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
      },
      "sale",
    );
  }, [effective, tax, sample]);

  const geometry = paperCss(effective.paper);

  if (!canSettings) {
    return (
      <AppShell>
        <div className="p-6">
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tax and receipt configuration is managed by an administrator.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-5 p-6">
        <header>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Tax rules apply to every register instantly. Receipt styling applies to all printed slips.
          </p>
        </header>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Percent className="size-4 text-primary" /> Tax &amp; pricing settings
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Enable tax</p>
                <p className="text-[11px] text-muted-foreground">Global tax calculation</p>
              </div>
              <Switch
                checked={tax.enabled}
                aria-label="Enable tax"
                onCheckedChange={(v) => updateSettings({ tax: { ...tax, enabled: v } })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tax rate (%)</Label>
              <Input
                className="numeric"
                value={tax.rate}
                onChange={(e) => updateSettings({ tax: { ...tax, rate: Number(e.target.value) || 0 } })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tax mode</Label>
              <div className="flex overflow-hidden rounded-md border border-border">
                {(
                  [
                    { m: "inclusive", label: "Prices Include Tax" },
                    { m: "exclusive", label: "Tax Added at Checkout" },
                  ] as { m: TaxMode; label: string }[]
                ).map((o) => (
                  <button
                    key={o.m}
                    onClick={() => updateSettings({ tax: { ...tax, mode: o.m } })}
                    className={`flex-1 px-2 py-2 text-xs ${
                      tax.mode === o.m
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Printer className="size-4 text-primary" /> Receipt &amp; slip customizer
            </h2>
            <div className="mt-4 space-y-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Paper size</Label>
                <select
                  value={receipt.paper}
                  onChange={(e) =>
                    updateSettings({ receipt: { ...receipt, paper: e.target.value as PaperSize } })
                  }
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  {(Object.keys(PAPER_LABELS) as PaperSize[]).map((p) => (
                    <option key={p} value={p}>
                      {PAPER_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Header text (address / phone)</Label>
                <Textarea
                  rows={2}
                  value={receipt.headerText}
                  onChange={(e) =>
                    updateSettings({ receipt: { ...receipt, headerText: e.target.value } })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Footer / thank-you note</Label>
                <Textarea
                  rows={2}
                  value={receipt.footerText}
                  onChange={(e) =>
                    updateSettings({ receipt: { ...receipt, footerText: e.target.value } })
                  }
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {TOGGLES.map((t) => (
                  <div
                    key={t.key}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                  >
                    <span className="text-sm">{t.label}</span>
                    <Switch
                      aria-label={t.label}
                      checked={!!receipt[t.key]}
                      onCheckedChange={(v) => updateSettings({ receipt: { ...receipt, [t.key]: v } })}
                    />
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setPrintSettings(receipt, tax);
                  toast.success("Receipt settings applied to all printers");
                }}
              >
                Apply to printers
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Live receipt preview · {PAPER_LABELS[receipt.paper]}
            </p>
            <div className="mt-3 overflow-hidden rounded-md bg-white p-2">
              <iframe
                title="Receipt preview"
                srcDoc={previewHtml}
                className="h-[520px] w-full border-0 bg-white"
                style={{ maxWidth: geometry.width }}
              />
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
