import { useEffect, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemedSelect } from "@/components/pos/ThemedSelect";
import {
  getPrinterPrefs,
  drawerPulseBytes,
  listPrinters,
  printBridge,
  rawPulse,
  setPrinterPrefs,
  type PrinterPrefs,
} from "@/lib/receipt-printer";
import { toast } from "sonner";
import { printTestReceipt } from "@/lib/pos-print";

/** Terminal-local receipt printer choice used for silent printing and the
 *  raw cash-drawer pulse. Only meaningful inside the Windows desktop shell. */
export function ReceiptPrinterSettings() {
  const [prefs, setPrefs] = useState<PrinterPrefs>({
    deviceName: "",
    share: "",
    drawerPin: 2,
    printMode: "dialog",
    encoding: "cp437",
    lineEnding: "lf",
  });
  const [printers, setPrinters] = useState<{ name: string; displayName: string }[]>([]);
  const [testing, setTesting] = useState(false);
  const desktop = typeof window !== "undefined" && !!printBridge();

  useEffect(() => {
    setPrefs(getPrinterPrefs());
    void listPrinters().then(setPrinters);
  }, []);

  const update = (next: PrinterPrefs) => {
    setPrefs(next);
    setPrinterPrefs(next);
  };

  const testDrawer = async () => {
    setTesting(true);
    try {
      const res = await rawPulse(drawerPulseBytes());
      if (!res.handled) {
        toast.info("Drawer kicks only work in the Windows desktop till");
      } else if (res.ok) {
        toast.success("Drawer pulse sent");
      } else {
        toast.error("Drawer did not open", { description: res.error });
      }
    } finally {
      setTesting(false);
    }
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
          onChange={(v: string) => update({ ...prefs, deviceName: v === "__default__" ? "" : v })}
          options={[
            { value: "__default__", label: "System default printer" },
            ...printers.map((p) => ({ value: p.name, label: p.displayName || p.name })),
          ]}
        />
      </div>

      <div className="mt-4 space-y-1">
        <Label className="text-xs text-muted-foreground">Receipt print mode</Label>
        <ThemedSelect
          value={prefs.printMode ?? "dialog"}
          onChange={(v: string) =>
            update({
              ...prefs,
              printMode: v === "thermal" ? "thermal" : v === "direct" ? "direct" : "dialog",
            })
          }
          options={[
            { value: "dialog", label: "Windows print dialog (normal)" },
            { value: "direct", label: "Direct to printer (no dialog)" },
            { value: "thermal", label: "Thermal text (ESC/POS)" },
          ]}
        />
        <p className="text-[11px] text-muted-foreground">
          The print dialog uses the normal Windows printing route — pick the printer and press
          Print, exactly like any other document. Choose “Direct to printer” once printing works
          to skip the dialog at the till. “Thermal text” sends raw ESC/POS commands instead, which
          only some printers accept.
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Character encoding</Label>
          <ThemedSelect
            value={prefs.encoding ?? "cp437"}
            onChange={(v: string) =>
              update({ ...prefs, encoding: v as NonNullable<PrinterPrefs["encoding"]> })
            }
            options={[
              { value: "cp437", label: "CP437 (default thermal)" },
              { value: "cp850", label: "CP850 (Latin-1)" },
              { value: "cp858", label: "CP858 (Latin-1 + €)" },
              { value: "ascii", label: "Plain ASCII" },
              { value: "utf8", label: "UTF-8" },
            ]}
          />
          <p className="text-[11px] text-muted-foreground">
            Applies to thermal (ESC/POS) printing. If accents or currency symbols come out as
            garbled characters, try CP850, CP858 or UTF-8.
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Line endings</Label>
          <ThemedSelect
            value={prefs.lineEnding ?? "lf"}
            onChange={(v: string) => update({ ...prefs, lineEnding: v === "crlf" ? "crlf" : "lf" })}
            options={[
              { value: "lf", label: "LF (standard)" },
              { value: "crlf", label: "CRLF (Windows-style)" },
            ]}
          />
          <p className="text-[11px] text-muted-foreground">
            Switch to CRLF if the slip prints as one long line or lines overlap.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-1">
        <Label className="text-xs text-muted-foreground">Drawer connector pin</Label>
        <ThemedSelect
          value={String(prefs.drawerPin ?? 2)}
          onChange={(v: string) => update({ ...prefs, drawerPin: v === "5" ? 5 : 2 })}
          options={[
            { value: "2", label: "Pin 2 (standard)" },
            { value: "5", label: "Pin 5 (alternative wiring)" },
          ]}
        />
        <p className="text-[11px] text-muted-foreground">
          Most RJ11 drawers answer on pin 2. Switch to pin 5 if the drawer stays shut.
        </p>
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
          Only needed as a backup route. The pulse is normally written straight to the printer
          above through the Windows raw spooler, so no share is required.
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
        <Button variant="outline" size="sm" disabled={testing} onClick={() => void testDrawer()}>
          <Printer className="size-3.5" /> {testing ? "Sending…" : "Test drawer kick"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => printTestReceipt()}>
          <Printer className="size-3.5" /> Test receipt
        </Button>
      </div>
    </section>
  );
}