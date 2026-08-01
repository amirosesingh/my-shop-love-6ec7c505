import { createFileRoute } from "@tanstack/react-router";
import { SettingsFrame, useSettingsCtx } from "@/components/pos/settings/SettingsFrame";
import { SecureCredentials } from "@/components/pos/SecureCredentials";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/settings/whatsapp")({
  head: () => ({
    meta: [
      { title: "WhatsApp Bills — Northwind POS" },
      { name: "description", content: "Send receipts and booking slips over the WhatsApp Cloud API, with message format, greeting and auto-send controls." },
      { property: "og:title", content: "WhatsApp Bills — Northwind POS" },
      { property: "og:description", content: "WhatsApp receipt delivery settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SettingsFrame
      title="WhatsApp bills"
      description="Send receipts and booking slips straight to the shopper's phone."
    >
      <WhatsAppForm />
    </SettingsFrame>
  ),
});

function WhatsAppForm() {
  const { whatsapp, setWhatsApp } = useSettingsCtx();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
        <div>
          <p className="text-sm">Send bills on WhatsApp</p>
          <p className="text-[11px] text-muted-foreground">
            Uses the Meta WhatsApp Cloud API. The access token is stored as a backend secret, never
            in the browser.
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
          <Label className="text-xs text-muted-foreground">Default country code</Label>
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
        <Input value={whatsapp.greeting} onChange={(e) => setWhatsApp({ greeting: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Sign-off line</Label>
        <Input value={whatsapp.signoff} onChange={(e) => setWhatsApp({ signoff: e.target.value })} />
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
    </div>
  );
}
