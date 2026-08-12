/**
 * Renderer view of the desktop auto-updater. In the browser build there is no
 * bridge, so the hook reports "unavailable" and the UI hides the card.
 */
import { useCallback, useEffect, useState } from "react";
import { APP_VERSION as GENERATED_VERSION } from "../version";
import {
  fetchManifest,
  isNewerVersion,
  resolvePlatformTarget,
  type UpdateManifest,
} from "./update-manifest";

/** Version baked in at build time — shown on web where there is no bridge. */
export const APP_VERSION: string = GENERATED_VERSION;

export type UpdateStatus =
  | "idle"
  | "checking"
  | "current"
  | "downloading"
  | "ready"
  | "error"
  | "unavailable";

export type UpdateState = {
  status: UpdateStatus;
  version: string;
  available?: string | null;
  percent: number;
  error: string | null;
};

type UpdateBridge = {
  appVersion: () => Promise<string>;
  updateStatus: () => Promise<UpdateState>;
  checkForUpdates: () => Promise<UpdateState>;
  installUpdate: () => Promise<{ ok: boolean; error?: string }>;
  onUpdateStatus: (cb: (s: UpdateState) => void) => () => void;
};

export const updateBridge = (): UpdateBridge | null => {
  if (typeof window === "undefined") return null;
  const api = (window as unknown as { pos?: Partial<UpdateBridge> }).pos;
  return api && typeof api.updateStatus === "function" ? (api as UpdateBridge) : null;
};

const INITIAL: UpdateState = { status: "idle", version: "", percent: 0, error: null };

export function useAppUpdates() {
  const [state, setState] = useState<UpdateState>(INITIAL);
  const [supported, setSupported] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [manifest, setManifest] = useState<UpdateManifest | null>(null);
  const [manifestChecking, setManifestChecking] = useState(false);

  useEffect(() => {
    const bridge = updateBridge();
    if (!bridge) return;
    setSupported(true);
    void bridge.updateStatus().then((s) => s && setState(s));
    return bridge.onUpdateStatus((s) => {
      setState(s);
      if (s.status === "current" || s.status === "ready" || s.status === "error")
        setLastChecked(new Date());
    });
  }, []);

  const check = useCallback(async () => {
    // The self-hosted manifest is read on every platform: it is the only
    // update source the web build has, and it gives the desktop card release
    // notes and a direct installer link even when the bridge stays quiet.
    setManifestChecking(true);
    try {
      const found = await fetchManifest();
      setManifest(found);
    } finally {
      setManifestChecking(false);
      setLastChecked(new Date());
    }
    const bridge = updateBridge();
    if (!bridge) return;
    const next = await bridge.checkForUpdates();
    setLastChecked(new Date());
    if (next) setState(next);
  }, []);

  const install = useCallback(async () => {
    await updateBridge()?.installUpdate();
  }, []);

  const version = state.version || APP_VERSION;
  const manifestVersion = manifest?.version ?? null;
  const manifestNewer = Boolean(manifestVersion && isNewerVersion(manifestVersion, version));
  const downloadUrl = manifest && manifestNewer ? resolvePlatformTarget(manifest)?.url ?? null : null;

  return {
    state,
    supported,
    check,
    install,
    lastChecked,
    manifest,
    manifestChecking,
    manifestVersion,
    manifestNewer,
    releaseNotes: manifest?.releaseNotes ?? null,
    downloadUrl,
  };
}