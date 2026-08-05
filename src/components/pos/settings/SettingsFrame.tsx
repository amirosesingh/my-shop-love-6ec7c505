/**
 * Shared shell for every settings page.
 *
 * Each area (display, tax, receipt typography, …) is now its own route, so a
 * page opens as a real window instead of an accordion panel that scrolls the
 * rest of the menu past the user. This frame owns the state all of those pages
 * share: which branch is being edited, whether that branch overrides the global
 * receipt profile, and the live preview.
 */
import { Link } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, Eye, Loader2, RotateCcw, Save, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/AppShell";
import { ThemedSelect } from "@/components/pos/ThemedSelect";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { usePos } from "@/lib/pos-store";
import { useAuth } from "@/lib/pos-auth";
import { db } from "@/lib/pos-db";
import { defaultPaymentDetails, defaultWhatsApp } from "@/lib/pos-seed";
import {
  PAPER_LABELS,
  paperCss,
  resolveReceiptCfg,
  saleReceiptPreview,
  setPreviewReceiptCfg,
  setPrintSettings,
} from "@/lib/pos-print";
import { defaultPaymentQr } from "@/lib/pos-types";
import type {
  FontStyleSettings,
  ReceiptOverride,
  ReceiptSettings,
  Sale,
} from "@/lib/pos-types";

type Ctx = {
  effective: ReceiptSettings;
  receipt: ReceiptSettings;
  tax: ReturnType<typeof usePos>["state"]["settings"]["tax"];
  payment: NonNullable<ReturnType<typeof usePos>["state"]["settings"]["payment"]>;
  whatsapp: NonNullable<ReturnType<typeof usePos>["state"]["settings"]["whatsapp"]>;
  overrideOn: boolean;
  updateSettings: ReturnType<typeof usePos>["updateSettings"];
  setField: <K extends keyof ReceiptOverride>(key: K, value: ReceiptOverride[K]) => void;
  setGlobal: (patch: Partial<ReceiptSettings>) => void;
  setFont: (scope: keyof ReceiptSettings["fonts"], patch: Partial<FontStyleSettings>) => void;
  setWhatsApp: (patch: Partial<NonNullable<ReturnType<typeof usePos>["state"]["settings"]["whatsapp"]>>) => void;
  setPaymentQr: (patch: Partial<ReturnType<typeof defaultQr>>) => void;
  paymentQr: ReturnType<typeof defaultQr>;
};

const defaultQr = () => defaultPaymentQr;

const SettingsCtx = createContext<Ctx | null>(null);

export function useSettingsCtx(): Ctx {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error("useSettingsCtx must be used inside <SettingsFrame>");
  return ctx;
}

type Props = {
  title: string;
  description: string;
  children: ReactNode;
  /** Branch picker + receipt preview only make sense for receipt-shaped pages. */
  branchAware?: boolean;
  showPreview?: boolean;
};

export function SettingsFrame({
  title,
  description,
  children,
  branchAware = false,
  showPreview = false,
}: Props) {
  const { state, stores, currentStore, updateSettings, upsertStore } = usePos();
  const { isAdmin, can } = useAuth();
  const canSettings = isAdmin || can("can_access_pos_settings");

  /* ---- Save / discard -------------------------------------------------- */
  // Edits apply live so the preview stays honest, but nothing is considered
  // stored until "Save settings" confirms the database write. The snapshot is
  // what "Discard changes" puts back.
  const [snapshot, setSnapshot] = useState(() => JSON.stringify(state.settings));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const dirty = JSON.stringify(state.settings) !== snapshot;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const save = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await db.saveSettingsNow(state.settings);
      setSnapshot(JSON.stringify(state.settings));
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      toast.success("Settings saved");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not reach the database";
      setSaveError(message);
      toast.error("Could not save settings", { description: message });
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    updateSettings(JSON.parse(snapshot));
    setSaveError("");
    toast.info("Changes discarded");
  };

  const { tax, receipt } = state.settings;
  const payment = state.settings.payment ?? defaultPaymentDetails;
  const whatsapp = state.settings.whatsapp ?? defaultWhatsApp;
  const paymentQr = payment.paymentQr ?? defaultPaymentQr;

  const [branchId, setBranchId] = useState(currentStore.id);
  const branch = stores.find((s) => s.id === branchId) ?? currentStore;
  const overrideOn = !!branch.receiptOverrides;

  const effective = useMemo(
    () => resolveReceiptCfg(receipt, overrideOn ? branch : null),
    [receipt, branch, overrideOn],
  );

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

  const setWhatsApp = (patch: Partial<typeof whatsapp>) =>
    updateSettings({ whatsapp: { ...whatsapp, ...patch } });

  const setPaymentQr = (patch: Partial<typeof paymentQr>) =>
    updateSettings({ payment: { ...payment, paymentQr: { ...paymentQr, ...patch } } });

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
    const total =
      tax.enabled && tax.mode === "exclusive" ? Number((subtotal + taxAmount).toFixed(2)) : subtotal;
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
    setPrintSettings(receipt, tax);
    return html;
  }, [effective, receipt, tax, sample]);

  if (!canSettings) {
    return (
      <AppShell>
        <div className="p-6">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This configuration is managed by an administrator.
          </p>
        </div>
      </AppShell>
    );
  }

  const geometry = paperCss(effective.paper);

  const ctx: Ctx = {
    effective,
    receipt,
    tax,
    payment,
    whatsapp,
    overrideOn,
    updateSettings,
    setField,
    setGlobal,
    setFont,
    setWhatsApp,
    setPaymentQr,
    paymentQr,
  };

  return (
    <AppShell>
      <SettingsCtx.Provider value={ctx}>
        <div className="mx-auto w-full max-w-4xl space-y-5 p-6">
          {/* Stays visible while the page scrolls, so there is always a way back. */}
          <div className="sticky top-0 z-20 -mx-6 -mt-6 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
            <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
              <Link to="/settings">
                <ArrowLeft className="size-4" /> All settings
              </Link>
            </Button>
          </div>

          <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold">{title}</h1>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            {showPreview && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" className="shrink-0">
                    <Eye className="size-4" /> Preview receipt
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:max-w-[520px]">
                  <SheetHeader>
                    <SheetTitle>Live receipt preview · {PAPER_LABELS[effective.paper]}</SheetTitle>
                  </SheetHeader>
                  <div className="overflow-auto px-4 pb-6">
                    <div
                      className="mx-auto overflow-hidden rounded-md bg-white p-2"
                      style={{ maxWidth: geometry.width }}
                    >
                      <iframe
                        title="Receipt preview"
                        srcDoc={previewHtml}
                        className="h-[70vh] w-full border-0 bg-white"
                      />
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </header>

          {branchAware && (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Editing branch</Label>
                <ThemedSelect
                  ariaLabel="Editing branch"
                  className="h-8 w-56"
                  value={branchId}
                  onChange={setBranchId}
                  options={stores.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
                />
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
          )}

          <section className="space-y-4 rounded-lg border border-border bg-card p-5">{children}</section>
        </div>
      </SettingsCtx.Provider>
    </AppShell>
  );
}
