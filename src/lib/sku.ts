/**
 * SKU numbering.
 *
 * The catalog is shared by every branch, so SKUs must never collide. In
 * "auto" mode the till stamps a plain running number (SKU-000123) on new
 * products; in "manual" mode the operator types their own code.
 *
 * The preference lives on the terminal (localStorage) so it works with no
 * connection; the counter is always advanced past whatever the catalog
 * already contains, which keeps branches from reusing a number.
 */
export type SkuMode = "auto" | "manual";

export type SkuSettings = {
  mode: SkuMode;
  prefix: string;
  /** number that will be used for the next generated SKU */
  next: number;
  /** digits the running number is padded to */
  pad: number;
};

const KEY = "pos.sku.settings";

export const defaultSkuSettings: SkuSettings = {
  mode: "auto",
  prefix: "SKU-",
  next: 1,
  pad: 6,
};

const listeners = new Set<() => void>();
const isBrowser = () => typeof window !== "undefined";

export function readSkuSettings(): SkuSettings {
  if (!isBrowser()) return defaultSkuSettings;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultSkuSettings;
    return { ...defaultSkuSettings, ...(JSON.parse(raw) as Partial<SkuSettings>) };
  } catch {
    return defaultSkuSettings;
  }
}

export function writeSkuSettings(patch: Partial<SkuSettings>) {
  if (!isBrowser()) return;
  const merged = { ...readSkuSettings(), ...patch };
  window.localStorage.setItem(KEY, JSON.stringify(merged));
  for (const l of listeners) l();
}

export function subscribeSku(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function formatSku(s: SkuSettings, n: number) {
  return `${s.prefix}${String(n).padStart(Math.max(1, s.pad), "0")}`;
}

/** Highest running number already used in the catalog, for this prefix. */
export function highestUsed(skus: string[], prefix: string): number {
  let top = 0;
  for (const sku of skus) {
    if (!sku.startsWith(prefix)) continue;
    const n = Number(sku.slice(prefix.length));
    if (Number.isFinite(n) && n > top) top = n;
  }
  return top;
}

/**
 * Next free SKU. Existing catalog codes win over the stored counter, so a
 * branch that syncs new products never hands out a duplicate.
 */
export function nextSku(existing: string[]): string {
  const s = readSkuSettings();
  const n = Math.max(s.next, highestUsed(existing, s.prefix) + 1);
  const code = formatSku(s, n);
  writeSkuSettings({ next: n + 1 });
  return code;
}

/** Preview the next code without consuming it. */
export function peekSku(existing: string[]): string {
  const s = readSkuSettings();
  return formatSku(s, Math.max(s.next, highestUsed(existing, s.prefix) + 1));
}
