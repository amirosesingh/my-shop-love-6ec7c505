/**
 * Durable storage for the Android build.
 *
 * Everything offline in this app (snapshot, outbox, journal, cached logins,
 * settings) is written through `localStorage`. On a phone that store can be
 * cleared by the system when space runs low, which would throw away unsynced
 * sales. So on Android every `pos.*` key is mirrored into Capacitor
 * Preferences — real app storage that survives — and read back on start-up.
 *
 * Web and Electron are untouched: `hydrateNativeStorage()` returns immediately
 * when the app is not running inside Capacitor.
 */
import { isNative } from "./native";

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

/** Write-through: local reads stay synchronous, the phone copy catches up. */
function install(store: Prefs) {
  if (installed) return;
  installed = true;
  const ls = window.localStorage;
  const setItem = ls.setItem.bind(ls);
  const removeItem = ls.removeItem.bind(ls);
  const clear = ls.clear.bind(ls);

  ls.setItem = (key: string, value: string) => {
    setItem(key, value);
    if (key.startsWith(PREFIX)) void store.set({ key, value }).catch(() => {});
  };
  ls.removeItem = (key: string) => {
    removeItem(key);
    if (key.startsWith(PREFIX)) void store.remove({ key }).catch(() => {});
  };
  ls.clear = () => {
    const keys = Object.keys(ls).filter((k) => k.startsWith(PREFIX));
    clear();
    for (const key of keys) void store.remove({ key }).catch(() => {});
  };
}

/**
 * Copy the device's durable copy into `localStorage` and start mirroring.
 * Must finish before the app reads any offline state.
 */
export async function hydrateNativeStorage(): Promise<void> {
  if (typeof window === "undefined" || !isNative()) return;
  const store = await loadPrefs();
  if (!store) return;
  try {
    const { keys } = await store.keys();
    for (const key of keys) {
      if (!key.startsWith(PREFIX)) continue;
      const { value } = await store.get({ key });
      if (value !== null) window.localStorage.setItem(key, value);
    }
    // Anything already in localStorage but not yet mirrored (first run after
    // an update) is pushed across so nothing is lost later.
    for (const key of Object.keys(window.localStorage)) {
      if (!key.startsWith(PREFIX) || keys.includes(key)) continue;
      const value = window.localStorage.getItem(key);
      if (value !== null) await store.set({ key, value });
    }
  } catch {
    /* fall back to plain localStorage for this session */
  }
  install(store);
}