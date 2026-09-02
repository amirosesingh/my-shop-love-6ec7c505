/**
 * Company branding: the trading name and a transparent PNG logo used on
 * receipts, the till header and the customer display. Stored once in the
 * shared settings record, so every terminal picks it up.
 */
import { useRef, useState } from "react";
import { ImageUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PanelSaveBar } from "@/platforms/web/components/pos/settings/PanelSaveBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePos } from "@/lib/pos-store";

const MAX_EDGE = 512;
const MAX_BYTES = 150_000;

/** Shrink an uploaded PNG so it stays small enough to travel with the settings row. */
async function toLogoDataUrl(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("That image could not be opened"));
    el.src = raw;
  });
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  if (scale === 1 && raw.length <= MAX_BYTES) return raw;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return raw;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // PNG keeps transparency; there is no lossy fallback that would.
  const out = canvas.toDataURL("image/png");
  if (out.length > MAX_BYTES * 1.4) {
    throw new Error("That logo is too detailed — save it smaller (under about 100 KB) and retry");
  }
  return out;
}

export function BrandingPanel() {
  const { state, updateSettings } = usePos();
  const receipt = state.settings.receipt;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | null) => {
    if (!file) return;
    if (file.type !== "image/png") {
      toast.error("Use a PNG file", {
        description: "PNG keeps the transparent background; JPG would print a white box.",
      });
      return;
    }
    setBusy(true);
    try {
      const logo = await toLogoDataUrl(file);
      updateSettings({ receipt: { ...receipt, logo, showLogo: true } });
      toast.success("Logo ready — save to publish it to every terminal");
    } catch (e) {
      toast.error("Could not use that image", { description: (e as Error).message });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <section className="space-y-3 rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">Company</h2>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Trading name</Label>
          <Input
            value={receipt.companyName}
            onChange={(e) => updateSettings({ receipt: { ...receipt, companyName: e.target.value } })}
            placeholder="Northwind & Co."
          />
          <p className="text-[11px] text-muted-foreground">
            Shown on receipts, the till header and the customer display.
          </p>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">Logo</h2>
            <p className="text-xs text-muted-foreground">
              Transparent PNG, up to 512px. It replaces the initials box on printed slips.
            </p>
          </div>
          <Switch
            aria-label="Show the logo"
            checked={receipt.showLogo}
            onCheckedChange={(v) => updateSettings({ receipt: { ...receipt, showLogo: v } })}
          />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div
            className="grid size-28 shrink-0 place-items-center rounded-lg border border-border p-2"
            style={{
              backgroundImage:
                "linear-gradient(45deg,hsl(var(--muted)) 25%,transparent 25%,transparent 75%,hsl(var(--muted)) 75%),linear-gradient(45deg,hsl(var(--muted)) 25%,transparent 25%,transparent 75%,hsl(var(--muted)) 75%)",
              backgroundSize: "16px 16px",
              backgroundPosition: "0 0, 8px 8px",
            }}
          >
            {receipt.logo ? (
              <img src={receipt.logo} alt="Company logo" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-[11px] text-muted-foreground">No logo</span>
            )}
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png"
              className="hidden"
              onChange={(e) => void pick(e.target.files?.[0] ?? null)}
            />
            <Button variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              <ImageUp className="mr-1 size-4" /> {receipt.logo ? "Replace logo" : "Upload PNG"}
            </Button>
            {receipt.logo ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updateSettings({ receipt: { ...receipt, logo: "" } })}
              >
                <Trash2 className="mr-1 size-4" /> Remove
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <PanelSaveBar />
    </>
  );
}
