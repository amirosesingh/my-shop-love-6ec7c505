import { createFileRoute } from "@tanstack/react-router";
import { SettingsTabs } from "@/components/pos/settings/SettingsTabs";
import { SettingsFrame } from "@/components/pos/settings/SettingsFrame";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ThemedSelect } from "@/components/pos/ThemedSelect";
import { usePos } from "@/lib/pos-store";
import { previewStockRef, type StockNumberReset } from "@/lib/stock-ref";
import { activeBranchId } from "@/lib/active-branch";

export const Route = createFileRoute("/settings/stock-numbering")({
  head: () => ({
    meta: [
      { title: "Stock Reference Numbering — Northwind POS" },
      {
        name: "description",
        content:
          "Choose the prefix, starting number, padding and reset rule for Stock Operations reference numbers.",
      },
      { property: "og:title", content: "Stock Reference Numbering — Northwind POS" },
      {
        property: "og:description",
        content: "Prefix, branch, period and running number rules for every stock count record.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StockNumberingPage,
});

function StockNumberingPage() {
  const { state, updateSettings } = usePos();
  const it = state.settings.integrations;
  const cfg = it.stockNumbering ?? {};
  const branchId = activeBranchId();
  const store = state.stores.find((s) => s.id === branchId) ?? state.stores[0];
  const branchCode = store?.code || "BR";

  const patch = (next: Partial<typeof cfg>) =>
    updateSettings({ integrations: { ...it, stockNumbering: { ...cfg, ...next } } });

  const pad = Math.min(6, Math.max(3, Math.round(cfg.padding ?? 4)));
  const sample = previewStockRef({ ...cfg, padding: pad }, branchCode);
  const prefixError =
    cfg.prefix && !/^[A-Za-z0-9]{1,6}$/.test(cfg.prefix)
      ? "Letters and numbers only, up to 6 characters."
      : "";

  return (
    <SettingsFrame
      title="Stock reference numbering"
      description="Every stock count gets its reference the moment the draft is created, so a count can be quoted before it is posted."
    >
      <SettingsTabs current="/settings/stock-numbering" />

      <div className="space-y-5">
        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <p className="text-xs text-muted-foreground">Next reference on this branch</p>
          <p className="font-mono text-lg font-semibold">{sample}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Branch {branchCode} · running number restarts {cfg.reset ?? "monthly"}.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Prefix</Label>
            <Input
              value={cfg.prefix ?? ""}
              placeholder="SO"
              onChange={(e) => patch({ prefix: e.target.value.toUpperCase() })}
            />
            <p className="text-[11px] text-muted-foreground">
              {prefixError || "Leave blank to use SO."}
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Starting number</Label>
            <Input
              inputMode="numeric"
              pattern="[0-9]*"
              value={String(cfg.startNumber ?? 1)}
              onChange={(e) =>
                patch({ startNumber: Number(e.target.value.replace(/\D+/g, "")) || 1 })
              }
            />
            <p className="text-[11px] text-muted-foreground">
              Used the first time a period starts — existing runs keep counting.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Running number length</Label>
            <Input
              inputMode="numeric"
              pattern="[0-9]*"
              value={String(pad)}
              onChange={(e) => patch({ padding: Number(e.target.value.replace(/\D+/g, "")) || 4 })}
            />
            <p className="text-[11px] text-muted-foreground">Between 3 and 6 digits.</p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Start again</Label>
            <ThemedSelect
              value={cfg.reset ?? "monthly"}
              onChange={(v) => patch({ reset: v as StockNumberReset })}
              options={[
                { value: "never", label: "Never — one continuous run" },
                { value: "yearly", label: "Every year" },
                { value: "monthly", label: "Every month" },
              ]}
              ariaLabel="Reset rule"
            />
            <p className="text-[11px] text-muted-foreground">
              The period appears in the reference so numbers stay unique.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3 md:col-span-2">
            <div>
              <p className="text-sm font-medium">Include the branch code</p>
              <p className="text-[11px] text-muted-foreground">
                Keeps two branches from minting the same reference.
              </p>
            </div>
            <Switch
              checked={cfg.includeBranch !== false}
              onCheckedChange={(on) => patch({ includeBranch: on })}
            />
          </div>
        </div>
      </div>
    </SettingsFrame>
  );
}
