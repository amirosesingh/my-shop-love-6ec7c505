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
  /** Drawer connector pin the printer pulses: 2 (standard) or 5. */
  drawerPin?: 2 | 5;
};

const EMPTY: PrinterPrefs = { deviceName: "", share: "", drawerPin: 2 };

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
    return {
      deviceName: parsed.deviceName ?? "",
      share: parsed.share ?? "",
      drawerPin: parsed.drawerPin === 5 ? 5 : 2,
    };
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

export type PulseResult = { handled: boolean; ok: boolean; error?: string };

/**
 * Raw ESC/POS pulse for the cash drawer.
 * `handled: false` means there is no desktop bridge (plain browser).
 */
export async function rawPulse(bytes: number[]): Promise<PulseResult> {
  const bridge = printBridge();
  if (!bridge?.printRaw) return { handled: false, ok: false };
  const { deviceName, share } = getPrinterPrefs();
  try {
    const res = await bridge.printRaw(bytes, {
      ...(deviceName ? { deviceName } : {}),
      ...(share ? { share } : {}),
    });
    if (!res?.ok) console.error("Drawer kick failed:", res?.error);
    return { handled: true, ok: !!res?.ok, ...(res?.error ? { error: res.error } : {}) };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("Drawer kick failed:", error);
    return { handled: true, ok: false, error };
  }
}

/** ESC/POS drawer kick bytes for the configured connector pin. */
export function drawerPulseBytes(): number[] {
  const pin = getPrinterPrefs().drawerPin === 5 ? 1 : 0;
  return [0x1b, 0x70, pin, 0x19, 0xfa];
}