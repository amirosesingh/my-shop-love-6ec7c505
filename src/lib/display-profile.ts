import { useEffect, useRef } from "react";
import { setUiScalePrefs, useUiScalePrefs, type UiScalePrefs } from "./use-ui-scale";
import { useTheme, type ThemeChoice } from "./theme";
import { setAccent, useAccent } from "./accent";
export type DisplayProfile = { scale: UiScalePrefs; theme: ThemeChoice; accent: string };
/** Apply resolved shared preferences while retaining this device's fallback. */
export function useDisplayProfile(profile: DisplayProfile | undefined) {
  const scale = useUiScalePrefs();
  const { theme, setTheme } = useTheme();
  const accent = useAccent();
  const fallback = useRef<DisplayProfile | null>(null);
  const local = useRef({ scale, theme, accent });
  local.current = { scale, theme, accent };
  useEffect(() => {
    if (!profile && !fallback.current) return;
    fallback.current ??= local.current;
    const next = profile ?? fallback.current;
    setUiScalePrefs(next.scale); setTheme(next.theme); setAccent(next.accent);
  }, [profile, setTheme]);
  useEffect(() => () => {
    if (fallback.current) { setUiScalePrefs(fallback.current.scale); setTheme(fallback.current.theme); setAccent(fallback.current.accent); }
  }, [setTheme]);
}
