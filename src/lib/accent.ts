/**
 * Terminal-local accent colour.
 *
 * The till ships amber, but a shop may want its own colour for buttons, icons
 * and highlights. The choice is stored per machine and written straight onto
 * the <html> element as inline custom properties, so it overrides both the
 * light and dark palettes without touching the design tokens themselves.
 */
import { useSyncExternalStore } from "react";

export type AccentPreset = { id: string; label: string; hex: string };

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "amber", label: "Amber (default)", hex: "#e8a33d" },
  { id: "blue", label: "Ocean blue", hex: "#3b82f6" },
  { id: "emerald", label: "Emerald", hex: "#10b981" },
  { id: "violet", label: "Violet", hex: "#8b5cf6" },
  { id: "rose", label: "Rose", hex: "#f43f5e" },
  { id: "slate", label: "Graphite", hex: "#64748b" },
];

export const DEFAULT_ACCENT = ACCENT_PRESETS[0]!.hex;

const KEY = "pos.accent-color";
let accent = DEFAULT_ACCENT;
let hydrated = false;
const listeners = new Set<() => void>();

const clean = (hex: string) =>
  /^#[0-9a-f]{6}$/i.test(hex.trim()) ? hex.trim().toLowerCase() : DEFAULT_ACCENT;

/** Relative luminance decides whether text on the accent is black or white. */
function readableForeground(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.45 ? "#10131a" : "#ffffff";
}

export function applyAccent(hex: string) {
  if (typeof document === "undefined") return;
  const value = clean(hex);
  const root = document.documentElement.style;
  const fg = readableForeground(value);
  root.setProperty("--primary", value);
  root.setProperty("--primary-foreground", fg);
  root.setProperty("--sidebar-primary", value);
  root.setProperty("--sidebar-primary-foreground", fg);
  root.setProperty("--ring", value);
  root.setProperty("--chart-1", value);
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    accent = clean(window.localStorage.getItem(KEY) ?? DEFAULT_ACCENT);
  } catch {
    accent = DEFAULT_ACCENT;
  }
  applyAccent(accent);
}

export function setAccent(hex: string) {
  ensureHydrated();
  accent = clean(hex);
  try {
    window.localStorage.setItem(KEY, accent);
  } catch {
    /* private mode — the colour lasts for this session only */
  }
  applyAccent(accent);
  listeners.forEach((l) => l());
}

export function useAccent(): string {
  return useSyncExternalStore(
    (fn) => {
      ensureHydrated();
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => {
      ensureHydrated();
      return accent;
    },
    () => DEFAULT_ACCENT,
  );
}
