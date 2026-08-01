import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Percent, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/AppShell";
import { SyncSettings } from "@/components/pos/SyncSettings";
import { SecureCredentials } from "@/components/pos/SecureCredentials";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePos } from "@/lib/pos-store";
import { defaultPaymentDetails, defaultWhatsApp } from "@/lib/pos-seed";
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
  const payment = state.settings.payment ?? defaultPaymentDetails;
  const whatsapp = state.settings.whatsapp ?? defaultWhatsApp;
  const setWhatsApp = (patch: Partial<typeof whatsapp>) =>
    updateSettings({ whatsapp: { ...whatsapp, ...patch } });

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
    const html = saleReceiptPreview(
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
    // restore the live printer profile after rendering the preview
    setPrintSettings(receipt, tax);
    return html;
  }, [effective, receipt, tax, sample]);

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
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Editing branch</Label>
                  <select
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                  >
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {overrideOn ? "Custom for this branch" : "Using global profile"}
                  </span>
                  <Switch
                    aria-label="Override for this branch"
                    checked={overrideOn}
                    onCheckedChange={toggleOverride}
                  />
                </div>
              </div>

              <Tabs defaultValue="identity">
                <TabsList className="flex flex-wrap">
                  <TabsTrigger value="identity">Identity</TabsTrigger>
                  <TabsTrigger value="type">Typography</TabsTrigger>
                  <TabsTrigger value="lines">Extra lines</TabsTrigger>
                  <TabsTrigger value="qr">QR code</TabsTrigger>
                  <TabsTrigger value="elements">Elements</TabsTrigger>
                  <TabsTrigger value="payment">Bank transfer</TabsTrigger>
                  <TabsTrigger value="whatsapp">WhatsApp bills</TabsTrigger>
                  <TabsTrigger value="sync">Sync &amp; backup</TabsTrigger>
                </TabsList>

                <TabsContent value="identity" className="space-y-3 pt-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {IDENTITY_FIELDS.map((f) => (
                      <div key={f.key} className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{f.label}</Label>
                        <Input
                          placeholder={f.placeholder}
                          value={(effective[f.key as keyof ReceiptSettings] as string) ?? ""}
                          onChange={(e) => setField(f.key, e.target.value as never)}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Header text (address / extra info)
                    </Label>
                    <Textarea
                      rows={2}
                      value={effective.headerText}
                      onChange={(e) => setField("headerText", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Footer / thank-you note</Label>
                    <Textarea
                      rows={2}
                      value={effective.footerText}
                      onChange={(e) => setField("footerText", e.target.value)}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="type" className="space-y-3 pt-4">
                  <p className="text-[11px] text-muted-foreground">
                    Typography is shared by every branch.
                  </p>
                  {FONT_SCOPES.map((scope) => {
                    const f = receipt.fonts[scope.key];
                    return (
                      <div key={scope.key} className="rounded-md border border-border p-3">
                        <p className="text-sm font-medium">{scope.label}</p>
                        <div className="mt-2 grid gap-3 sm:grid-cols-4">
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Family</Label>
                            <select
                              value={f.family}
                              onChange={(e) =>
                                setFont(scope.key, { family: e.target.value as FontFamilyKey })
                              }
                              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                            >
                              {FAMILIES.map((o) => (
                                <option key={o.key} value={o.key}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Size (px)</Label>
                            <Input
                              type="number"
                              min={7}
                              max={40}
                              className="numeric"
                              value={f.size}
                              onChange={(e) =>
                                setFont(scope.key, { size: Number(e.target.value) || 12 })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Spacing (px)</Label>
                            <Input
                              type="number"
                              min={0}
                              max={8}
                              step={0.5}
                              className="numeric"
                              value={f.spacing}
                              onChange={(e) =>
                                setFont(scope.key, { spacing: Number(e.target.value) || 0 })
                              }
                            />
                          </div>
                          <div className="flex items-end justify-between gap-2">
                            <Label className="text-[11px] text-muted-foreground">Bold</Label>
                            <Switch
                              aria-label={`${scope.label} bold`}
                              checked={f.bold}
                              onCheckedChange={(v) => setFont(scope.key, { bold: v })}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </TabsContent>

                <TabsContent value="lines" className="space-y-3 pt-4">
                  {(effective.customLines ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No custom lines yet — add policy notes, promotions or opening hours.
                    </p>
                  )}
                  {(effective.customLines ?? []).map((line, i) => (
                    <div key={line.id} className="flex flex-wrap items-center gap-2">
                      <Input
                        className="min-w-[180px] flex-1"
                        value={line.text}
                        placeholder="Return policy: 7 days with receipt"
                        onChange={(e) =>
                          setField(
                            "customLines",
                            effective.customLines.map((l) =>
                              l.id === line.id ? { ...l, text: e.target.value } : l,
                            ),
                          )
                        }
                      />
                      <select
                        value={line.placement}
                        onChange={(e) =>
                          setField(
                            "customLines",
                            effective.customLines.map((l) =>
                              l.id === line.id
                                ? { ...l, placement: e.target.value as ReceiptCustomLine["placement"] }
                                : l,
                            ),
                          )
                        }
                        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                      >
                        <option value="header">Below header</option>
                        <option value="footer">Above footer</option>
                      </select>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Move up"
                        disabled={i === 0}
                        onClick={() => {
                          const next = [...effective.customLines];
                          [next[i - 1], next[i]] = [next[i], next[i - 1]];
                          setField("customLines", next);
                        }}
                      >
                        ↑
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove line"
                        onClick={() =>
                          setField(
                            "customLines",
                            effective.customLines.filter((l) => l.id !== line.id),
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setField("customLines", [
                        ...(effective.customLines ?? []),
                        {
                          id: `line-${Date.now()}`,
                          text: "",
                          placement: "footer" as const,
                        },
                      ])
                    }
                  >
                    <Plus className="mr-1 size-4" /> Add line
                  </Button>
                </TabsContent>

                <TabsContent value="qr" className="space-y-3 pt-4">
                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span className="text-sm">Print QR code</span>
                    <Switch
                      aria-label="Print QR code"
                      checked={effective.qr.enabled}
                      onCheckedChange={(v) => setField("qr", { ...effective.qr, enabled: v })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Link or text</Label>
                    <Input
                      placeholder="https://example.com/feedback"
                      value={effective.qr.value}
                      onChange={(e) => setField("qr", { ...effective.qr, value: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Size (px)</Label>
                      <Input
                        type="number"
                        min={48}
                        max={220}
                        className="numeric"
                        value={effective.qr.size}
                        onChange={(e) =>
                          setField("qr", { ...effective.qr, size: Number(e.target.value) || 96 })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Placement</Label>
                      <select
                        value={effective.qr.placement}
                        onChange={(e) =>
                          setField("qr", {
                            ...effective.qr,
                            placement: e.target.value as ReceiptCustomLine["placement"],
                          })
                        }
                        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                      >
                        <option value="header">Top of receipt</option>
                        <option value="footer">Bottom of receipt</option>
                      </select>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="elements" className="space-y-3 pt-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Paper size</Label>
                    <select
                      value={receipt.paper}
                      onChange={(e) => setGlobal({ paper: e.target.value as PaperSize })}
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    >
                      {(Object.keys(PAPER_LABELS) as PaperSize[]).map((p) => (
                        <option key={p} value={p}>
                          {PAPER_LABELS[p]}
                        </option>
                      ))}
                    </select>
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
                          onCheckedChange={(v) => setGlobal({ [t.key]: v } as Partial<ReceiptSettings>)}
                        />
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="payment" className="space-y-3 pt-4">
                  <p className="text-xs text-muted-foreground">
                    Shown on the customer-facing display and printed on booking slips so shoppers
                    can settle a balance by bank transfer.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Bank name</Label>
                      <Input
                        value={payment.bankName}
                        onChange={(e) => updateSettings({ payment: { ...payment, bankName: e.target.value } })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Account name</Label>
                      <Input
                        value={payment.accountName}
                        onChange={(e) => updateSettings({ payment: { ...payment, accountName: e.target.value } })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Account number</Label>
                      <Input
                        className="numeric"
                        value={payment.accountNumber}
                        onChange={(e) => updateSettings({ payment: { ...payment, accountNumber: e.target.value } })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        WhatsApp number (QR code)
                      </Label>
                      <Input
                        className="numeric"
                        placeholder="+15550100"
                        value={payment.whatsapp}
                        onChange={(e) => updateSettings({ payment: { ...payment, whatsapp: e.target.value } })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Instruction note</Label>
                    <Input
                      value={payment.note}
                      onChange={(e) => updateSettings({ payment: { ...payment, note: e.target.value } })}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span className="text-sm">Print transfer details on booking slips</span>
                    <Switch
                      aria-label="Print transfer details on booking slips"
                      checked={payment.showOnBookingSlip}
                      onCheckedChange={(v) =>
                        updateSettings({ payment: { ...payment, showOnBookingSlip: v } })
                      }
                    />
                  </div>

                  <div className="space-y-3 rounded-md border border-border p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm">Payment QR on customer display</p>
                        <p className="text-xs text-muted-foreground">
                          Paste your bank / e-wallet QR payload (EMVCo, UPI, PromptPay, DuitNow) or
                          a payment link.
                        </p>
                      </div>
                      <Switch
                        aria-label="Payment QR on customer display"
                        checked={paymentQr.enabled}
                        onCheckedChange={(v) => setPaymentQr({ enabled: v })}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Caption</Label>
                        <Input
                          value={paymentQr.label}
                          onChange={(e) => setPaymentQr({ label: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Mode</Label>
                        <div className="flex gap-2">
                          {(["static", "dynamic"] as const).map((m) => (
                            <Button
                              key={m}
                              type="button"
                              size="sm"
                              variant={paymentQr.mode === m ? "default" : "outline"}
                              onClick={() => setPaymentQr({ mode: m })}
                            >
                              {m === "static" ? "Static" : "Dynamic"}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">QR payload</Label>
                      <Textarea
                        rows={3}
                        placeholder="00020101021226...  or  https://pay.example.com?amt={amount}&ref={reference}"
                        value={paymentQr.payload}
                        onChange={(e) => setPaymentQr({ payload: e.target.value })}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Dynamic mode replaces {"{amount}"} and {"{reference}"} with the live bill
                        total and receipt number at checkout.
                      </p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="whatsapp" className="space-y-3 pt-4">
                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <div>
                      <p className="text-sm">Send bills on WhatsApp</p>
                      <p className="text-[11px] text-muted-foreground">
                        Uses the Meta WhatsApp Cloud API. The access token is stored as a backend
                        secret, never in the browser.
                      </p>
                    </div>
                    <Switch
                      aria-label="Send bills on WhatsApp"
                      checked={whatsapp.enabled}
                      onCheckedChange={(v) => setWhatsApp({ enabled: v })}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Phone number ID</Label>
                      <Input
                        className="numeric"
                        placeholder="1029384756"
                        value={whatsapp.phoneNumberId}
                        onChange={(e) => setWhatsApp({ phoneNumberId: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        Default country code
                      </Label>
                      <Input
                        className="numeric"
                        placeholder="+1"
                        value={whatsapp.countryCode}
                        onChange={(e) => setWhatsApp({ countryCode: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Message format</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          { v: "summary", label: "Totals only" },
                          { v: "itemized", label: "Full itemised bill" },
                        ] as const
                      ).map((o) => (
                        <button
                          key={o.v}
                          onClick={() => setWhatsApp({ format: o.v })}
                          className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                            whatsapp.format === o.v
                              ? "border-primary bg-primary/15 text-primary"
                              : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Greeting line</Label>
                    <Input
                      value={whatsapp.greeting}
                      onChange={(e) => setWhatsApp({ greeting: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Sign-off line</Label>
                    <Input
                      value={whatsapp.signoff}
                      onChange={(e) => setWhatsApp({ signoff: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span className="text-sm">Auto-send after every sale</span>
                    <Switch
                      aria-label="Auto-send after every sale"
                      checked={whatsapp.autoSendOnSale}
                      onCheckedChange={(v) => setWhatsApp({ autoSendOnSale: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span className="text-sm">Auto-send booking slips</span>
                    <Switch
                      aria-label="Auto-send booking slips"
                      checked={whatsapp.autoSendOnBooking}
                      onCheckedChange={(v) => setWhatsApp({ autoSendOnBooking: v })}
                    />
                  </div>
                  <SecureCredentials />
                </TabsContent>

                <TabsContent value="sync" className="pt-4">
                  <SyncSettings />
                </TabsContent>
              </Tabs>

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
