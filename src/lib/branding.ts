import { useEffect, useState } from "react";

/**
 * Terminal branding. Captured on first run (desktop install) and kept in sync
 * with the receipt identity settings, so no company name is ever hardcoded.
 */
export type Branding = {
  company: string;
  terminal: string;
  /** true once someone has completed the first-run setup on this machine */
  configured: boolean;
};

const KEY = "pos.branding";
const EVENT = "pos:branding-changed";

export const defaultBranding: Branding = {
  company: "My Store",
  terminal: "POS Terminal 01",
  configured: false,
};

export function readBranding(): Branding {
  if (typeof window === "undefined") return defaultBranding;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultBranding;
    return { ...defaultBranding, ...(JSON.parse(raw) as Partial<Branding>) };
  } catch {
    return defaultBranding;
  }
}

export function writeBranding(patch: Partial<Branding>) {
  if (typeof window === "undefined") return;
  const next = { ...readBranding(), ...patch };
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Hydration-safe read of the local branding record. */
export function useBranding(): Branding {
  const [brand, setBrand] = useState<Branding>(defaultBranding);
  useEffect(() => {
    const sync = () => setBrand(readBranding());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return brand;
}

/** True when running inside the Electron desktop shell. */
export const isDesktop = () =>
  typeof window !== "undefined" && Boolean((window as { pos?: unknown }).pos);