import { useEffect, useState } from "react";
import { ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isDesktop, restoreBrandingFromDisk, writeBranding } from "@/lib/branding";
import { usePosOptional } from "@/lib/pos-store";

/**
 * Shown once per machine right after install: the operator names their business
 * and this till, and every screen and receipt picks that name up.
 */
export function FirstRunSetup({ children }: { children: React.ReactNode }) {
  const pos = usePosOptional();
  const state = pos?.state;
  const updateSettings = pos?.updateSettings;
  const [needed, setNeeded] = useState(false);
  const [checked, setChecked] = useState(false);
  const [company, setCompany] = useState("");
  const [terminal, setTerminal] = useState("POS Terminal 01");

  useEffect(() => {
    if (!isDesktop()) {
      setChecked(true);
      return;
    }
    // The on-disk mirror wins: setup must only ever run on a fresh install.
    void restoreBrandingFromDisk().then((b) => {
      setNeeded(!b.configured);
      setChecked(true);
    });
  }, []);

  if (!checked) return null;
  if (!needed) return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const name = company.trim();
          if (!name) return;
          writeBranding({ company: name, terminal: terminal.trim() || "POS Terminal 01", configured: true });
          if (state && updateSettings) {
            updateSettings({ receipt: { ...state.settings.receipt, companyName: name } });
          }
          setNeeded(false);
        }}
        className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-6"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ReceiptText className="size-5" />
          </div>
          <div>
            <p className="font-semibold leading-tight">Set up this terminal</p>
            <p className="text-xs text-muted-foreground">
              One-time setup — you can change these later in Settings.
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="company">Company / shop name</Label>
          <Input
            id="company"
            autoFocus
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="e.g. Sunrise Mart"
          />
          <p className="text-[11px] text-muted-foreground">
            Printed on every receipt and shown across the app.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="terminal">Terminal name</Label>
          <Input
            id="terminal"
            value={terminal}
            onChange={(e) => setTerminal(e.target.value)}
            placeholder="POS Terminal 01"
          />
        </div>

        <Button type="submit" className="w-full" disabled={!company.trim()}>
          Start using the POS
        </Button>
      </form>
    </div>
  );
}