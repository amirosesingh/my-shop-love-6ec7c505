import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/**
 * Dynamic UI scale for the whole POS.
 *
 * Windows tills run anywhere from a 1024x768 panel to a 4K desktop. Rather
 * than fixed pixel sizes we derive one multiplier from the viewport (or from
 * the operator's manual preference) and let CSS drive font sizes and control
 * heights from it, so buttons stay touch-friendly (>= 44px) on small screens
 * and readable on large ones.
 */
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export type UiDensity = "comfortable" | "compact";
export type UiScalePrefs = {
  mode: "auto" | "manual";
  scale: number;
  /** Font-only multiplier, layered on top of the interface scale. */
  textScale: number;
  density: UiDensity;
};

const KEY = "pos.ui-scale";
const DEFAULTS: UiScalePrefs = { mode: "auto", scale: 1, textScale: 1, density: "comfortable" };

let prefs: UiScalePrefs = DEFAULTS;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load(): UiScalePrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<UiScalePrefs>;
    return {
      mode: parsed.mode === "manual" ? "manual" : "auto",
      scale: clamp(Number(parsed.scale) || 1, 0.85, 1.5),
      textScale: clamp(Number(parsed.textScale) || 1, 0.9, 1.6),
      density: parsed.density === "compact" ? "compact" : "comfortable",
    };
  } catch {
    return DEFAULTS;
  }
}

let hydrated = false;
const ensureHydrated = () => {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  prefs = load();
};

export function setUiScalePrefs(patch: Partial<UiScalePrefs>) {
  ensureHydrated();
  prefs = { ...prefs, ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* private mode — keep the in-memory value */
  }
  emit();
}

const subscribe = (fn: () => void) => {
  ensureHydrated();
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function useUiScalePrefs(): UiScalePrefs {
  return useSyncExternalStore(
    subscribe,
    () => {
      ensureHydrated();
      return prefs;
    },
    () => DEFAULTS,
  );
}

export function computeUiScale(width: number, height: number): number {
  // 1440x900 is the reference layout at scale 1.
  const byWidth = width / 1440;
  const byHeight = height / 900;
  return Number(clamp(Math.min(byWidth, byHeight), 0.85, 1.35).toFixed(3));
}

/** Applies the effective scale + density to the document root. */
export function useUiScale(): number {
  const { mode, scale: manual, textScale, density } = useUiScalePrefs();
  const [auto, setAuto] = useState(1);

  useEffect(() => {
    const apply = () => setAuto(computeUiScale(window.innerWidth, window.innerHeight));
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  const scale = mode === "manual" ? manual : auto;

  useEffect(() => {
    document.documentElement.style.setProperty("--pos-scale", String(scale));
    document.documentElement.style.setProperty("--pos-text-scale", String(textScale));
    document.documentElement.classList.toggle("pos-compact", density === "compact");
  }, [scale, textScale, density]);

  return scale;
}

/** Convenience setter for settings UI. */
export function useSetUiScale() {
  return useCallback((patch: Partial<UiScalePrefs>) => setUiScalePrefs(patch), []);
}
