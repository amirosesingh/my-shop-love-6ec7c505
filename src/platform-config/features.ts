/**
 * One source of truth for what each shell can do.
 *
 * Components must not branch on `isElectron()` / `isNative()` to decide whether
 * a capability exists — they ask for the capability here. Removing a feature
 * from a platform is then a one-line change in this table plus deleting the
 * screen from that platform's folder; the other two shells are untouched.
 */
import { isElectron, isNative } from "./platform";

export type PlatformName = "web" | "mobile" | "windows";

export type PlatformFeatures = {
  /** A local SQL Server mirror is present and writable on this device. */
  localDb: boolean;
  /** Sales are written locally first and synced later. */
  offlineFirst: boolean;
  /** Cashier PIN sign-in on the device (back-office browsers use email). */
  cashierPin: boolean;
  /** Terminal activation is required before trading. */
  terminalActivation: boolean;
  /** Emergency PIN recovery hub is reachable. */
  emergencyRecovery: boolean;
  /** Direct thermal printing / cash drawer pulses through the shell. */
  hardwarePrinting: boolean;
  /** Camera barcode scanning through the device camera. */
  cameraScanner: boolean;
  /** In-app update checks (OTA bundle or installer). */
  appUpdates: boolean;
  /** Native window chrome (minimise / maximise / close). */
  windowChrome: boolean;
  /** Secrets sealed by the operating system keystore. */
  sealedSecrets: boolean;
};

export const platformFeatures = {
  web: {
    localDb: false,
    offlineFirst: false,
    cashierPin: false,
    terminalActivation: false,
    emergencyRecovery: false,
    hardwarePrinting: false,
    cameraScanner: true,
    appUpdates: false,
    windowChrome: false,
    sealedSecrets: false,
  },
  mobile: {
    localDb: false,
    offlineFirst: false,
    cashierPin: true,
    terminalActivation: true,
    emergencyRecovery: true,
    hardwarePrinting: false,
    cameraScanner: true,
    appUpdates: true,
    windowChrome: false,
    sealedSecrets: true,
  },
  windows: {
    localDb: true,
    offlineFirst: true,
    cashierPin: true,
    terminalActivation: true,
    emergencyRecovery: true,
    hardwarePrinting: true,
    cameraScanner: false,
    appUpdates: true,
    windowChrome: true,
    sealedSecrets: true,
  },
} as const satisfies Record<PlatformName, PlatformFeatures>;

/** Which shell this code is executing in right now. */
export function currentPlatform(): PlatformName {
  if (isElectron()) return "windows";
  if (isNative()) return "mobile";
  return "web";
}

/** The feature set for the running shell. */
export function features(): PlatformFeatures {
  return platformFeatures[currentPlatform()];
}

/** Convenience read for a single capability. */
export function hasFeature(name: keyof PlatformFeatures): boolean {
  return features()[name];
}

/**
 * Shell identity for the handful of modules that must pick a bridge
 * (OS keystore, printer, updater) rather than a capability. These are the only
 * sanctioned readers of the raw detection primitives, so shared code never
 * calls `isElectron()` / `isNative()` itself.
 */
export const isWindowsShell = (): boolean => currentPlatform() === "windows";
export const isMobileShell = (): boolean => currentPlatform() === "mobile";
export const isWebShell = (): boolean => currentPlatform() === "web";
