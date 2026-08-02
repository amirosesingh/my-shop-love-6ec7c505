import { useEffect, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemedSelect } from "@/components/pos/ThemedSelect";
import {
  getPrinterPrefs,
  listPrinters,
  printBridge,
  setPrinterPrefs,
  type PrinterPrefs,
} from "@/lib/receipt-printer";
import { toast } from "sonner";

/** Terminal-local receipt printer choice used for silent printing and the
 *  raw cash-drawer pulse. Only meaningful inside the Windows desktop shell. */
export function ReceiptPrinterSettings() {
  const [prefs, setPrefs] = useState<PrinterPrefs>({ deviceName: "", share: "" });
  const [printers, setPrinters] = useState<{ name: string; displayName: string }[]>([]);
  const desktop = typeof window !== "undefined" && !!printBridge();

  useEffect(() => {
    setPrefs(getPrinterPrefs());
    void listPrinters().then(setPrinters);
  }, []);

  const update = (next: PrinterPrefs) => {
    setPrefs(next);
    setPrinterPrefs(next);
  };

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Printer className="size-4 text-primary" /> Receipt printer
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {desktop
          ? "Receipts print straight to this printer with no Windows dialog, and the cash drawer opens through the same device."
          : "Printer selection applies to the Windows desktop till. In a browser the standard print dialog is always used."}
      </p>

      <div className="mt-4 space-y-1">
        <Label className="text-xs text-muted-foreground">Printer</Label>
        <ThemedSelect
          value={prefs.deviceName || "__default__"}
          onValueChange={(v) => update({ ...prefs, deviceName: v === "__default__" ? "" : v })}
          options={[
            { value: "__default__", label: "System default printer" },
            ...printers.map((p) => ({ value: p.name, label: p.displayName || p.name })),
          ]}
        />
      </div>

      <div className="mt-4 space-y-1">
        <Label className="text-xs text-muted-foreground">
          Drawer share name (optional)
        </Label>
        <Input
          value={prefs.share}
          onChange={(e) => update({ ...prefs, share: e.target.value })}
          placeholder="e.g. ThermalPrinter or \\\\localhost\\ThermalPrinter"
          className="h-9 text-sm"
        />
        <p className="text-[11px] text-muted-foreground">
          The drawer pulse is sent as raw bytes to this Windows printer share. Leave blank to reuse
          the printer name above.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void listPrinters().then((list) => {
              setPrinters(list);
              toast.success(
                list.length ? `${list.length} printer(s) found` : "No printers reported",
              );
            })
          }
        >
          <RefreshCw className="size-3.5" /> Refresh printers
        </Button>
      </div>
    </section>
  );
}