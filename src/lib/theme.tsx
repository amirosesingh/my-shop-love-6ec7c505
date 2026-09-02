import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeChoice = "system" | "light" | "dark";

const KEY = "pos.theme";
/** Older builds wrote the same preference here; read once, then forget it. */
const LEGACY_KEY = "pos.ui.theme";

/** Reads the choice from the current key, adopting an older device's value. */
const readStoredTheme = (): ThemeChoice | null => {
  try {
    const current = localStorage.getItem(KEY);
    if (current) return current as ThemeChoice;
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return null;
    localStorage.setItem(KEY, legacy);
    localStorage.removeItem(LEGACY_KEY);
    return legacy as ThemeChoice;
  } catch {
    return null;
  }
};


type Ctx = {
  theme: ThemeChoice;
  resolved: "light" | "dark";
  setTheme: (t: ThemeChoice) => void;
};

const ThemeContext = createContext<Ctx>({
  theme: "system",
  resolved: "dark",
  setTheme: () => {},
});

/** Runs before paint so the terminal never flashes the wrong palette. */
export const themeBootScript = `(function(){try{var t=localStorage.getItem("${KEY}")||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}
try{var a=localStorage.getItem("pos.accent-color");if(a&&/^#[0-9a-fA-F]{6}$/.test(a)){var n=parseInt(a.slice(1),16);var ch=[(n>>16)&255,(n>>8)&255,n&255].map(function(c){var s=c/255;return s<=0.03928?s/12.92:Math.pow((s+0.055)/1.055,2.4);});var L=0.2126*ch[0]+0.7152*ch[1]+0.0722*ch[2];var f=L>0.45?"#10131a":"#ffffff";var r=document.documentElement.style;r.setProperty("--primary",a);r.setProperty("--primary-foreground",f);r.setProperty("--sidebar-primary",a);r.setProperty("--sidebar-primary-foreground",f);r.setProperty("--ring",a);r.setProperty("--chart-1",a);}}catch(e){}})();`;

const systemDark = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>("system");
  // Seed from what the boot script already wrote on <html>, so the first
  // client render matches the server markup instead of flipping the palette.
  const [prefersDark, setPrefersDark] = useState(() =>
    typeof document === "undefined"
      ? true
      : document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    const stored = readStoredTheme();
    if (stored === "light" || stored === "dark" || stored === "system") setThemeState(stored);


    setPrefersDark(systemDark());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolved: "light" | "dark" =
    theme === "system" ? (prefersDark ? "dark" : "light") : theme;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);

  const setTheme = useCallback((t: ThemeChoice) => {
    setThemeState(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* private mode */
    }
  }, []);

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
