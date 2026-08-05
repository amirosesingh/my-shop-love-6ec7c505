/**
 * Online kill-switch.
 *
 * While the till has a connection it re-checks its activation token every five
 * minutes (and immediately when the link returns). If management revoked the
 * token the machine wipes its saved credentials and locks.
 *
 * With no connection nothing happens at all — offline selling must never be
 * interrupted by a check that cannot run.
 */
import { useEffect, useState } from "react";
import {
  clearTerminalConfig,
  fetchTokenStatus,
  readTerminalConfig,
  restoreTerminalConfigFromDisk,
  stampHeartbeat,
  subscribeTerminalConfig,
  type TerminalConfig,
} from "./terminal-tokens";

const CHECK_MS = 5 * 60 * 1000;
const BLOCK_KEY = "pos.terminal.revoked";

let blocked = typeof window !== "undefined" && window.localStorage.getItem(BLOCK_KEY) === "1";
const listeners = new Set<() => void>();

/** True once a revocation has been confirmed by the server. */
export const isTerminalRevoked = () => blocked;

function setBlocked(next: boolean) {
  if (blocked === next) return;
  blocked = next;
  if (typeof window !== "undefined") {
    if (next) window.localStorage.setItem(BLOCK_KEY, "1");
    else window.localStorage.removeItem(BLOCK_KEY);
  }
  for (const l of listeners) l();
}

export function subscribeRevocation(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function clearRevocation() {
  setBlocked(false);
}

export type RevocationState = {
  config: TerminalConfig | null;
  /** the token was confirmed revoked — lock the screen */
  revoked: boolean;
  online: boolean;
  lastCheckedAt: string | null;
};

export function useRevocationCheck(): RevocationState {
  const [config, setConfig] = useState<TerminalConfig | null>(() => readTerminalConfig());
  const [revoked, setRevoked] = useState(isTerminalRevoked);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

  useEffect(() => subscribeTerminalConfig(() => setConfig(readTerminalConfig())), []);
  // After an in-place desktop update the renderer storage can come back empty;
  // the shell keeps a copy of the activation on disk.
  useEffect(() => {
    void restoreTerminalConfigFromDisk();
  }, []);
  useEffect(() => {
    const off = subscribeRevocation(() => setRevoked(isTerminalRevoked()));
    return () => {
      off();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    if (!config) return;
    let cancelled = false;

    const check = async () => {
      // No link, no verdict: the till keeps selling exactly as it was.
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      try {
        const remote = await fetchTokenStatus(config.tokenId);
        if (cancelled) return;
        setLastCheckedAt(new Date().toISOString());
        // An empty lookup is inconclusive (for example while the API schema is
        // reloading). Only a positive revoked verdict may wipe activation.
        if (!remote) return;
        if (remote.status === "revoked") {
          setBlocked(true);
          clearTerminalConfig();
          return;
        }
        setBlocked(false);
        void stampHeartbeat(config.tokenId);
      } catch {
        /* transient network error — try again on the next tick */
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), CHECK_MS);
    const onOnline = () => void check();
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [config]);

  return { config, revoked, online, lastCheckedAt };
}
