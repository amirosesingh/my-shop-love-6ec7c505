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
import { isNative } from "@/platforms/mobile/native";
import { isPersistentKey } from "./live-mode";

const PREFIX = "pos.";

type Prefs = {
  get: (o: { key: string }) => Promise<{ value: string | null }>;
  set: (o: { key: string; value: string }) => Promise<void>;
  remove: (o: { key: string }) => Promise<void>;
  keys: () => Promise<{ keys: string[] }>;
};

let prefs: { value: Prefs } | null = null;
let installed = false;

/**
 * The plugin handle is kept inside a wrapper object: a Capacitor plugin Proxy
 * answers every property — `then` included — with a native call, so returning
 * one from an `async` function makes the runtime call `Preferences.then(...)`
 * and the bridge fails with "not implemented".
 */
async function loadPrefs(): Promise<{ value: Prefs } | null> {
  if (prefs) return prefs;
  try {
    const mod = await import("@capacitor/preferences");
    const plugin = mod.Preferences as unknown as Prefs | undefined;
    if (!plugin || typeof plugin.get !== "function") return null;
    prefs = { value: plugin };
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
    if (isPersistentKey(key)) void store.set({ key, value }).catch(() => {});
  };
  ls.removeItem = (key: string) => {
    removeItem(key);
    if (isPersistentKey(key)) void store.remove({ key }).catch(() => {});
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
  const loaded = await loadPrefs();
  if (!loaded) return;
  const store = loaded.value;
  try {
    const { keys } = await store.keys();
    for (const key of keys) {
      if (!isPersistentKey(key)) {
        // Left over from the previous offline-first build.
        await store.remove({ key }).catch(() => {});
        continue;
      }
      const { value } = await store.get({ key });
      if (value !== null) window.localStorage.setItem(key, value);
    }
    for (const key of Object.keys(window.localStorage)) {
      if (!isPersistentKey(key) || keys.includes(key)) continue;
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
      if (isPersistentKey(key)) continue;
      if (key.startsWith(PREFIX) || key === "pos-state-v2") ls.removeItem(key);
    }
  } catch {
    /* nothing else we can do */
  }
}
