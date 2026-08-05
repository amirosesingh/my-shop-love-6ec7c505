/**
 * Device storage for the Android build.
 *
 * Android runs live-only: business records (catalogue, members, sales, stock,
 * shifts, coupons) are never kept on the phone. Only a short allow-list of
 * interface preferences is mirrored into Capacitor Preferences so the app
 * remembers its look and its terminal identity between launches. Anything left
 * behind by an older offline build is purged on start-up.
 *
 * Web and Electron are untouched: `hydrateNativeStorage()` returns immediately
 * when the app is not running inside Capacitor.
 */
import { isNative } from "./native";
import { isUiKey } from "./live-mode";

const PREFIX = "pos.";

type Prefs = {
  get: (o: { key: string }) => Promise<{ value: string | null }>;
  set: (o: { key: string; value: string }) => Promise<void>;
  remove: (o: { key: string }) => Promise<void>;
  keys: () => Promise<{ keys: string[] }>;
};

let prefs: Prefs | null = null;
let installed = false;

async function loadPrefs(): Promise<Prefs | null> {
  if (prefs) return prefs;
  try {
    const mod = await import("@capacitor/preferences");
    prefs = mod.Preferences as unknown as Prefs;
    return prefs;
  } catch {
    return null;
  }
}

/** Write-through for preference keys only; business keys are never persisted. */
function install(store: Prefs) {
  if (installed) return;
  installed = true;
  const ls = window.localStorage;
  const setItem = ls.setItem.bind(ls);
  const removeItem = ls.removeItem.bind(ls);
  const clear = ls.clear.bind(ls);

  ls.setItem = (key: string, value: string) => {
    setItem(key, value);
    if (isUiKey(key)) void store.set({ key, value }).catch(() => {});
  };
  ls.removeItem = (key: string) => {
    removeItem(key);
    if (isUiKey(key)) void store.remove({ key }).catch(() => {});
  };
  ls.clear = () => {
    const keys = Object.keys(ls).filter((k) => k.startsWith(PREFIX));
    clear();
    for (const key of keys) void store.remove({ key }).catch(() => {});
  };
}

/**
 * Restore saved preferences, drop every business key an older offline build
 * may have written, and start mirroring. Must finish before the app renders.
 */
export async function hydrateNativeStorage(): Promise<void> {
  if (typeof window === "undefined" || !isNative()) return;
  // Business data must never survive on the phone, whether or not the
  // Preferences plugin is available this session.
  purgeBusinessKeys();
  const store = await loadPrefs();
  if (!store) return;
  try {
    const { keys } = await store.keys();
    for (const key of keys) {
      if (!isUiKey(key)) {
        // Left over from the previous offline-first build.
        await store.remove({ key }).catch(() => {});
        continue;
      }
      const { value } = await store.get({ key });
      if (value !== null) window.localStorage.setItem(key, value);
    }
    for (const key of Object.keys(window.localStorage)) {
      if (!isUiKey(key) || keys.includes(key)) continue;
      const value = window.localStorage.getItem(key);
      if (value !== null) await store.set({ key, value });
    }
  } catch {
    /* fall back to plain localStorage for this session */
  }
  install(store);
}

/** Remove every non-preference key the app may have cached on this device. */
export function purgeBusinessKeys() {
  if (typeof window === "undefined") return;
  try {
    const ls = window.localStorage;
    for (const key of Object.keys(ls)) {
      if (isUiKey(key)) continue;
      if (key.startsWith(PREFIX) || key === "pos-state-v2") ls.removeItem(key);
    }
  } catch {
    /* nothing else we can do */
  }
}
