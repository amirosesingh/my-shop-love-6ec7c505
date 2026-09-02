/**
 * Renderer bridge for the one-click SQL Server driver installer.
 *
 * The desktop shell owns the download, the checksum check and msiexec; the UI
 * only asks for it and renders progress. On the web build the bridge is absent
 * and every call resolves to a friendly "desktop only" result.
 */
export type DriverCatalogEntry = {
  id: string;
  kind: "odbc" | "oledb";
  name: string;
  version: string;
  manualUrl: string;
  recommended: boolean;
  installed: boolean;
};

export type DriverListResult = {
  ok: boolean;
  platform?: string;
  supported?: boolean;
  catalogVersion?: number;
  installed?: string[];
  drivers?: DriverCatalogEntry[];
  error?: string;
};

export type DriverInstallResult = {
  ok: boolean;
  /** OK | OK_RESTART | EBUSY | EPLATFORM | ENOENTRY | EURL | EDOWNLOAD | ECHECKSUM | ECANCELLED | EEXIT | EFAILED */
  code?: string;
  id?: string;
  name?: string;
  exitCode?: number;
  restartRequired?: boolean;
  installed?: string[];
  manualUrl?: string;
  error?: string;
};

export type DriverProgress = { phase: "download" | "verify" | "install"; percent: number };

export type DriverBridge = {
  listDrivers: () => Promise<DriverListResult>;
  installDriver: (id: string) => Promise<DriverInstallResult>;
  onDriverProgress: (cb: (p: DriverProgress) => void) => () => void;
};

export const driverBridge = (): DriverBridge | null => {
  if (typeof window === "undefined") return null;
  const pos = (window as unknown as { pos?: Partial<DriverBridge> }).pos;
  return pos && typeof pos.listDrivers === "function" ? (pos as DriverBridge) : null;
};

export const MANUAL_ODBC_URL =
  "https://learn.microsoft.com/sql/connect/odbc/download-odbc-driver-for-sql-server";

export async function listDrivers(): Promise<DriverListResult> {
  const bridge = driverBridge();
  if (!bridge) return { ok: false, supported: false, error: "Desktop app only." };
  try {
    return await bridge.listDrivers();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function installDriver(id: string): Promise<DriverInstallResult> {
  const bridge = driverBridge();
  if (!bridge) return { ok: false, code: "EWEB", error: "Desktop app only." };
  try {
    return await bridge.installDriver(id);
  } catch (err) {
    return {
      ok: false,
      code: "EFAILED",
      error: err instanceof Error ? err.message : String(err),
      manualUrl: MANUAL_ODBC_URL,
    };
  }
}

/** Plain-language line for every install outcome, success or failure. */
export function describeInstallResult(res: DriverInstallResult): string {
  switch (res.code) {
    case "OK":
      return `${res.name ?? "The driver"} was installed and verified.`;
    case "OK_RESTART":
      return `${res.name ?? "The driver"} was installed, but Windows needs a restart to finish.`;
    case "ECHECKSUM":
      return "Security check failed: the downloaded file did not match Microsoft's fingerprint, so nothing was installed.";
    case "ECANCELLED":
      return "Installation was cancelled, so the driver is still missing.";
    case "EDOWNLOAD":
      return res.error ?? "Could not download the driver — check the internet or proxy.";
    case "EEXIT":
      return `The Windows installer stopped with exit code ${res.exitCode}.`;
    case "EBUSY":
      return "A driver installation is already running.";
    case "EPLATFORM":
      return "Driver installation is only available on the Windows desktop app.";
    default:
      return res.error ?? "The driver could not be installed.";
  }
}

/** What the progress line should read while an install runs. */
export function describeProgress(p: DriverProgress | null): string | null {
  if (!p) return null;
  if (p.phase === "download") return `Downloading ${p.percent}%`;
  if (p.phase === "verify") return "Verifying the download fingerprint";
  return "Installing… approve the Windows permission prompt";
}
