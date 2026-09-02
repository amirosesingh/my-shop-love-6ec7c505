/**
 * Platform-isolated persistence for register canvas layouts.
 *
 * A screen designed on a 4K back-office browser is not the screen a cashier
 * wants on a compact till, so web and Electron keep entirely separate saves.
 * Electron writes through the existing device-settings IPC (so the layout
 * survives a browser cache wipe) and mirrors to localStorage for instant paint.
 */
import { isElectron } from "@/platforms/mobile/native";
import { readLocalSetting, writeLocalSetting } from "./local-db";

export type PlatformTarget = "web" | "electron";

export const platformTarget = (): PlatformTarget => (isElectron() ? "electron" : "web");

const KEY_PREFIX = "pos.register.layout";
export const layoutKey = (terminal: string, platform: PlatformTarget = platformTarget()) =>
  `${KEY_PREFIX}.v4:${platform}:${terminal || "default"}`;

/** Legacy single-platform keys, read once and migrated into the platform key. */
export const legacyKeys = (terminal: string) => {
  const t = terminal || "default";
  return [`${KEY_PREFIX}.v3:${t}`, `${KEY_PREFIX}.v2:${t}`, `${KEY_PREFIX}.v1:${t}`];
};

export function readLocal(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage full or blocked — the till still works, it just won't persist */
  }
}

/** Reads the raw JSON for this platform, falling back to the desktop store. */
export async function readLayoutRaw(terminal: string): Promise<string | null> {
  const key = layoutKey(terminal);
  const local = readLocal(key);
  if (local) return local;
  if (!isElectron()) return null;
  const remote = await readLocalSetting(key);
  if (remote) writeLocal(key, remote);
  return remote;
}

export async function writeLayoutRaw(terminal: string, json: string | null) {
  const key = layoutKey(terminal);
  writeLocal(key, json);
  if (isElectron()) await writeLocalSetting(key, json);
}
