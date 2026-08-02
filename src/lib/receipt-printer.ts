/**
 * Receipt-printer plumbing shared by the browser and the Electron till.
 *
 * In the desktop shell the preload bridge prints silently (no Windows print
 * dialog) and can push raw ESC/POS bytes to kick the cash drawer. In a browser
 * neither exists, so callers fall back to the classic hidden-iframe print.
 */

const PRINTER_KEY = "pos-receipt-printer-v1";

type PrintResult = { ok: boolean; error?: string };

type PrintBridge = {
  print?: (html: string, options?: { deviceName?: string }) => Promise<PrintResult>;
  printRaw?: (
    bytes: number[],
    options?: { deviceName?: string; share?: string },
  ) => Promise<PrintResult>;
  listPrinters?: () => Promise<{
    ok: boolean;
    printers: { name: string; displayName: string; isDefault: boolean }[];
  }>;
};

export type PrinterPrefs = {
  /** Empty string means "use the Windows default printer". */
  deviceName: string;
  /** Shared name used for the raw drawer pulse; defaults to the device name. */
  share: string;
};

const EMPTY: PrinterPrefs = { deviceName: "", share: "" };

export function printBridge(): PrintBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as unknown as { pos?: PrintBridge }).pos;
  return bridge && typeof bridge.print === "function" ? bridge : null;
}

export function getPrinterPrefs(): PrinterPrefs {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(PRINTER_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<PrinterPrefs>;
    return { deviceName: parsed.deviceName ?? "", share: parsed.share ?? "" };
  } catch {
    return EMPTY;
  }
}

export function setPrinterPrefs(prefs: PrinterPrefs) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PRINTER_KEY, JSON.stringify(prefs));
}

export async function listPrinters() {
  const bridge = printBridge();
  if (!bridge?.listPrinters) return [];
  const res = await bridge.listPrinters();
  return res.ok ? res.printers : [];
}

/** Silent print through Electron. Returns false when no bridge is available. */
export async function silentPrint(html: string): Promise<boolean> {
  const bridge = printBridge();
  if (!bridge?.print) return false;
  const { deviceName } = getPrinterPrefs();
  try {
    const res = await bridge.print(html, deviceName ? { deviceName } : undefined);
    if (!res?.ok) console.error("Silent print failed:", res?.error);
  } catch (err) {
    console.error("Silent print failed:", err);
  }
  return true;
}

/** Raw ESC/POS pulse for the cash drawer. Returns false without a bridge. */
export async function rawPulse(bytes: number[]): Promise<boolean> {
  const bridge = printBridge();
  if (!bridge?.printRaw) return false;
  const { deviceName, share } = getPrinterPrefs();
  try {
    const res = await bridge.printRaw(bytes, {
      ...(deviceName ? { deviceName } : {}),
      ...(share || deviceName ? { share: share || deviceName } : {}),
    });
    if (!res?.ok) console.error("Drawer kick failed:", res?.error);
  } catch (err) {
    console.error("Drawer kick failed:", err);
  }
  return true;
}