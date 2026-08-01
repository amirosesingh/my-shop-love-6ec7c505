import { createFileRoute } from "@tanstack/react-router";
import { SettingsFrame, useSettingsCtx } from "@/components/pos/settings/SettingsFrame";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { TaxMode } from "@/lib/pos-types";

export const Route = createFileRoute("/settings/tax")({
  head: () => ({
    meta: [
      { title: "Tax & Pricing — Northwind POS" },
      { name: "description", content: "Set the global tax rate and choose whether prices include tax or have it added at checkout." },
      { property: "og:title", content: "Tax & Pricing — Northwind POS" },
      { property: "og:description", content: "Global tax rate and inclusive / exclusive pricing mode." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TaxSettingsPage,
});

function TaxSettingsPage() {
  return (
    <SettingsFrame
      title="Tax & pricing"
      description="Tax rules apply to every register instantly."
    >
      <TaxForm />
    </SettingsFrame>
  );
}

function TaxForm() {
  const { tax, updateSettings } = useSettingsCtx();
  return (
    <div className="grid gap-4 md:grid-cols-3">
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
  );
}
