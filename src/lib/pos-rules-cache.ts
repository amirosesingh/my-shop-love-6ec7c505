/**
 * Last verified register rules for this device, kept across restarts.
 *
 * A phone or till that loses its connection must keep working with the rules
 * it last genuinely received, not silently fall back to the strict built-in
 * safety set. Only the rule values and their identity stamp are stored — never
 * a PIN, token, signing key or database key — in the same encrypted device
 * store the rest of the app uses.
 *
 * The entry is branch-aware: a terminal moved to another branch discards it
 * rather than carrying the old branch's policy across.
 */
import { getDeviceSecret, setDeviceSecret, clearDeviceSecret } from "./device-secrets";
import { normalizeRules, type PosRules } from "./pos-rules";

const SLOT = "pos-rules-last-good";

export type CachedRules = {
  terminalId: string;
  branchId: string;
  revision: string;
  syncedAt: number;
  rules: PosRules;
};

type Stored = Omit<CachedRules, "rules"> & { rules: unknown };

/** The stored set, but only when it belongs to this terminal and branch. */
export async function readCachedRules(
  terminalId: string,
  branchId: string,
): Promise<CachedRules | null> {
  const stored = await getDeviceSecret<Stored>(SLOT).catch(() => null);
  if (!stored || typeof stored !== "object") return null;
  if ((stored.branchId ?? "") !== branchId) return null;
  if (stored.terminalId && terminalId && stored.terminalId !== terminalId) return null;
  return {
    terminalId: stored.terminalId ?? "",
    branchId: stored.branchId ?? "",
    revision: stored.revision ?? "",
    syncedAt: Number(stored.syncedAt) || 0,
    rules: normalizeRules(stored.rules),
  };
}

/** Replace the stored set in one step; a matching revision is left alone. */
export async function writeCachedRules(entry: CachedRules): Promise<void> {
  await setDeviceSecret(SLOT, entry).catch(() => undefined);
}

export function clearCachedRules(): void {
  clearDeviceSecret(SLOT);
}
