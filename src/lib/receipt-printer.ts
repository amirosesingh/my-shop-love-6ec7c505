/**
 * Receipt-printer plumbing shared by the browser and the Electron till.
 *
 * In the desktop shell the preload bridge prints silently (no Windows print
 * dialog) and can push raw ESC/POS bytes to kick the cash drawer. In a browser
 * neither exists, so callers fall back to the classic hidden-iframe print.
 */

import type { SlipEncoding, SlipLineEnding } from "./escpos";

const PRINTER_KEY = "pos-receipt-printer-v1";

type PrintResult = { ok: boolean; error?: string };

type PrintBridge = {
  print?: (
    html: string,
    options?: { deviceName?: string; paper?: string; dialog?: boolean },
  ) => Promise<PrintResult>;
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
  /**
   * How slips reach the printer on the desktop till.
   * `dialog` = normal Windows print dialog through the printer driver.
   * `direct` = same driver rendering, sent straight to the printer, no dialog.
   * `thermal` = ESC/POS text through the RAW spooler (no driver).
   */
  printMode?: "dialog" | "direct" | "thermal";
  /** Character encoding used for raw ESC/POS text on this printer. */
  encoding?: SlipEncoding;
  /** Line terminator this printer expects: LF or CRLF. */
  lineEnding?: SlipLineEnding;
  /** Page margins in millimetres applied to every printed document. */
  margins?: { top: number; right: number; bottom: number; left: number };
};

const EMPTY: PrinterPrefs = {
  deviceName: "",
  share: "",
  drawerPin: 2,
  printMode: "dialog",
  encoding: "cp437",
  lineEnding: "lf",
  margins: { top: 4, right: 4, bottom: 4, left: 4 },
};

const mm = (v: unknown, fallback: number) => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(30, Math.max(0, Math.round(n * 10) / 10));
};

function normalizeMargins(v: unknown): NonNullable<PrinterPrefs["margins"]> {
  const m = (v ?? {}) as Partial<NonNullable<PrinterPrefs["margins"]>>;
  return {
    top: mm(m.top, 4),
    right: mm(m.right, 4),
    bottom: mm(m.bottom, 4),
    left: mm(m.left, 4),
  };
}

const ENCODINGS: SlipEncoding[] = ["ascii", "cp437", "cp850", "cp858", "utf8"];

function normalizeEncoding(v: unknown): SlipEncoding {
  return ENCODINGS.includes(v as SlipEncoding) ? (v as SlipEncoding) : "cp437";
}

function normalizeLineEnding(v: unknown): SlipLineEnding {
  return v === "crlf" ? "crlf" : "lf";
}

function normalizeMode(mode: unknown): "dialog" | "direct" | "thermal" {
  if (mode === "thermal") return "thermal";
  // Legacy value written by earlier versions.
  if (mode === "direct" || mode === "graphics") return "direct";
  return "dialog";
}

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
      printMode: normalizeMode(parsed.printMode),
      encoding: normalizeEncoding(parsed.encoding),
      lineEnding: normalizeLineEnding(parsed.lineEnding),
      margins: normalizeMargins(parsed.margins),
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

export type PulseResult = { handled: boolean; ok: boolean; error?: string };

/**
 * Silent print through Electron.
 * `handled: false` means there is no desktop bridge (plain browser).
 */
export async function silentPrint(
  html: string,
  paper?: string,
  dialog = false,
): Promise<PulseResult> {
  const bridge = printBridge();
  if (!bridge?.print) return { handled: false, ok: false };
  const { deviceName } = getPrinterPrefs();
  try {
    const res = await bridge.print(html, {
      ...(deviceName ? { deviceName } : {}),
      ...(paper ? { paper } : {}),
      ...(dialog ? { dialog: true } : {}),
    });
    if (!res?.ok) console.error("Silent print failed:", res?.error);
    return { handled: true, ok: !!res?.ok, ...(res?.error ? { error: res.error } : {}) };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("Silent print failed:", error);
    return { handled: true, ok: false, error };
  }
}

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