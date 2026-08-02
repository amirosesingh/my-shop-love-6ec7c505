/**
 * Renderer view of the desktop boot-health record. The browser build has no
 * bridge, so the hook reports unsupported and the settings card hides itself.
 */
import { useCallback, useEffect, useState } from "react";

export type HealthState = {
  version: string;
  lastGoodVersion: string | null;
  lastGoodAt: string | null;
  lastFailureAt: string | null;
  failures: number;
  reason?: string | null;
  safeMode: boolean;
  canRollback: boolean;
  rollbackHint: string | null;
};

type HealthBridge = {
  reportReady: () => Promise<unknown>;
  healthState: () => Promise<HealthState>;
  rollbackNow: () => Promise<{ ok: boolean; error?: string; version?: string }>;
};

export const healthBridge = (): HealthBridge | null => {
  if (typeof window === "undefined") return null;
  const api = (window as unknown as { pos?: Partial<HealthBridge> }).pos;
  return api && typeof api.healthState === "function" ? (api as HealthBridge) : null;
};

/** Tells the shell this build reached the UI — clears the bad-start marker. */
export function reportAppReady() {
  void healthBridge()?.reportReady();
}

export function useAppHealth() {
  const [state, setState] = useState<HealthState | null>(null);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const bridge = healthBridge();
    if (!bridge) return;
    setState(await bridge.healthState());
  }, []);

  useEffect(() => {
    if (!healthBridge()) return;
    setSupported(true);
    void refresh();
  }, [refresh]);

  const rollback = useCallback(async () => {
    const bridge = healthBridge();
    if (!bridge) return;
    setBusy(true);
    setError(null);
    const res = await bridge.rollbackNow();
    if (!res.ok) setError(res.error ?? "Roll back failed.");
    setBusy(false);
  }, []);

  return { state, supported, busy, error, refresh, rollback };
}
