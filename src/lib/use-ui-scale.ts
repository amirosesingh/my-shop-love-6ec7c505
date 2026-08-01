import { useEffect, useState } from "react";

/**
 * Dynamic UI scale for the register.
 *
 * Windows tills run anywhere from a 1024x768 panel to a 4K desktop. Rather
 * than fixed pixel sizes we derive one multiplier from the viewport and let
 * CSS drive font sizes and control heights from it, so buttons stay
 * touch-friendly (>= 44px) on small screens and readable on large ones.
 */
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function computeUiScale(width: number, height: number): number {
  // 1440x900 is the reference layout at scale 1.
  const byWidth = width / 1440;
  const byHeight = height / 900;
  return Number(clamp(Math.min(byWidth, byHeight), 0.85, 1.35).toFixed(3));
}

export function useUiScale(): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const apply = () => setScale(computeUiScale(window.innerWidth, window.innerHeight));
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--pos-scale", String(scale));
  }, [scale]);

  return scale;
}