/**
 * Cross-platform access to the tenant's central cloud credentials
 * (Supabase URL + publishable key) on terminal apps.
 *
 * - Windows (Electron): values live in the OS vault (DPAPI via safeStorage),
 *   written and read through the main-process bridge. The renderer only ever
 *   sees a masked hint.
 * - Android (APK): values live in the Android Keystore via
 *   EncryptedSharedPreferences (capacitor-secure-storage-plugin).
 * - Web: nothing to do — the deployment carries its own publishable config.
 *
 * After any change the in-memory tenant override is refreshed so the next
 * cloud call picks the new credentials up without an app restart.
 */
import { isTerminalApp } from "@/platform-config/platform";
import { isWindowsShell, isMobileShell } from "@/platform-config/features";
import {
  setTerminalSupabaseOverride,
  clearTerminalSupabaseOverride,
  hasSupabaseConfig,
  supabaseConfig,
} from "./external-supabase-config";
import { resetExternalClient, createTenantClient } from "@/integrations/supabase/external-client";
import { setSyncState } from "./sync-status";

/** Fresh keys saved: unpark the sync engine and let it catch up at once. */
function afterCredentialsSaved() {
  setSyncState({ credentialsInvalid: false, lastError: null, cloudConfigured: true });
  void import("./sync-engine")
    .then((m) => void m.runExclusive("credentials-saved"))
    .catch(() => {});
}

export type CloudKeyStatus = {
  configured: boolean;
  /** Tenant URL — not a secret, safe to prefill in the settings form. */
  url: string;
  /** Masked key (first 6 … last 4). The full key never reaches the renderer on Electron. */
  keyHint: string;
  /** True when the platform vault encrypted the values at rest. */
  encrypted: boolean;
  source: "electron" | "android" | "web";
};

const ANDROID_URL_KEY = "pos.cloud.url";
const ANDROID_KEY_KEY = "pos.cloud.key";

type SecureStoragePluginType = {
  get(options: { key: string }): Promise<{ value: string }>;
  set(options: { key: string; value: string }): Promise<{ value: boolean }>;
  remove(options: { key: string }): Promise<{ value: boolean }>;
};

/**
 * The plugin handle is returned inside a wrapper object: a Capacitor plugin
 * Proxy answers every property — `then` included — with a native call, so
 * returning it straight from an `async` function makes the runtime call
 * `SecureStoragePlugin.then(...)` and Android replies "not implemented".
 */
async function androidStore(): Promise<{ value: SecureStoragePluginType } | null> {
  try {
    const mod = await import("capacitor-secure-storage-plugin");
    const plugin = mod.SecureStoragePlugin as unknown as SecureStoragePluginType | undefined;
    if (!plugin || typeof plugin.get !== "function") return null;
    return { value: plugin };
  } catch {
    return null;
  }
}

async function androidRead(): Promise<{ url: string; key: string } | null> {
  try {
    const loaded = await androidStore();
    if (!loaded) return null;
    const store = loaded.value;
    const [url, key] = await Promise.all([
      store.get({ key: ANDROID_URL_KEY }).then((r) => r.value, () => ""),
      store.get({ key: ANDROID_KEY_KEY }).then((r) => r.value, () => ""),
    ]);
    return url && key ? { url, key } : null;
  } catch {
    return null;
  }
}


const mask = (key: string) => (key.length > 10 ? `${key.slice(0, 6)}…${key.slice(-4)}` : "••••");

export async function cloudKeyStatus(): Promise<CloudKeyStatus> {
  if (isWindowsShell() && window.pos?.cloudKeyStatus) {
    const res = await window.pos.cloudKeyStatus();
    return {
      configured: Boolean(res.configured),
      url: res.url ?? "",
      keyHint: res.keyHint ?? "",
      encrypted: Boolean(res.encrypted),
      source: "electron",
    };
  }
  if (isMobileShell()) {
    const saved = await androidRead();
    return {
      configured: Boolean(saved),
      url: saved?.url ?? "",
      keyHint: saved ? mask(saved.key) : "",
      encrypted: true,
      source: "android",
    };
  }
  return {
    configured: hasSupabaseConfig(),
    url: hasSupabaseConfig() ? supabaseConfig().url : "",
    keyHint: "",
    encrypted: false,
    source: "web",
  };
}

export type CloudTestResult = { ok: boolean; detail: string };

/**
 * Two separate questions, answered separately, because a brand-new customer
 * has a perfectly good project whose POS schema has not been created yet:
 *
 *   A. reachable + authenticated — the address answers and accepts the key
 *   B. schemaReady               — the POS tables exist in that project
 *
 * A failure of B is a warning, never a reason to refuse the configuration.
 */
export type CloudProbe = {
  /** the address answered at all */
  reachable: boolean;
  /** the project accepted the publishable key */
  authenticated: boolean;
  /** the POS tables are present */
  schemaReady: boolean;
  stage: "invalid" | "unreachable" | "rejected" | "no-schema" | "ok";
  detail: string;
};

const NOT_REACHED = (detail: string): CloudProbe => ({
  reachable: false,
  authenticated: false,
  schemaReady: false,
  stage: "unreachable",
  detail,
});

/** A. Does the address answer, and does it accept this key? */
async function probeAuth(url: string, key: string): Promise<CloudProbe | null> {
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403)
      return {
        reachable: true,
        authenticated: false,
        schemaReady: false,
        stage: "rejected",
        detail: "The address answered but rejected this API key — check the key and try again.",
      };
    return null; // reachable; the key is proven properly by the REST call below
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NOT_REACHED(
      `No answer from ${url} — check the address and this device's internet connection (${msg}).`,
    );
  }
}

/** Full two-part probe. Never throws. */
export async function probeCloudConnection(url: string, key: string): Promise<CloudProbe> {
  const cleanUrl = url.trim().replace(/\/+$/, "");
  const cleanKey = key.trim();
  if (!/^https:\/\/.+/i.test(cleanUrl))
    return {
      reachable: false,
      authenticated: false,
      schemaReady: false,
      stage: "invalid",
      detail: "Enter the full https:// project URL.",
    };
  if (cleanKey.length < 10)
    return {
      reachable: false,
      authenticated: false,
      schemaReady: false,
      stage: "invalid",
      detail: "The API key looks too short.",
    };

  const early = await probeAuth(cleanUrl, cleanKey);
  if (early) return early;

  try {
    const client = createTenantClient(cleanUrl, cleanKey);
    const { error } = await client.from("stores").select("id").limit(1);
    if (!error)
      return {
        reachable: true,
        authenticated: true,
        schemaReady: true,
        stage: "ok",
        detail: "Connected — the address, the key and the POS tables all check out.",
      };

    const msg = error.message ?? "query failed";
    if (/invalid api ?key|jwt|unauthorized|not authorized/i.test(msg))
      return {
        reachable: true,
        authenticated: false,
        schemaReady: false,
        stage: "rejected",
        detail: "The key was rejected by the server — check it and try again.",
      };
    // Missing table or a row rule that hides everything: the connection itself
    // is proven, the customer's POS schema simply is not provisioned yet.
    if (/does not exist|relation|schema cache|permission denied/i.test(msg))
      return {
        reachable: true,
        authenticated: true,
        schemaReady: false,
        stage: "no-schema",
        detail: "Connected. The POS tables are not provisioned in this project yet.",
      };
    return {
      reachable: true,
      authenticated: true,
      schemaReady: false,
      stage: "no-schema",
      detail: `Connected, but the POS tables could not be read: ${msg}`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NOT_REACHED(
      /fetch|network/i.test(msg)
        ? "No route to the server — check the URL and this device's internet connection."
        : msg,
    );
  }
}

/**
 * Back-compatible wrapper: a connection counts as usable once the address
 * answers and the key is accepted, whether or not the schema exists yet.
 */
export async function testCloudCredentials(url: string, key: string): Promise<CloudTestResult> {
  const probe = await probeCloudConnection(url, key);
  return { ok: probe.reachable && probe.authenticated, detail: probe.detail };
}

/** Persist a new pair in the platform vault and make it live immediately. */
export async function saveCloudCredentials(
  url: string,
  key: string,
): Promise<{ ok: boolean; error?: string; encrypted?: boolean }> {
  const cleanUrl = url.trim().replace(/\/+$/, "");
  const cleanKey = key.trim();
  if (isWindowsShell() && window.pos?.setCloudCredentials) {
    const res = await window.pos.setCloudCredentials({ url: cleanUrl, key: cleanKey });
    if (!res.ok) return { ok: false, error: res.error ?? "Could not save the credentials." };
    setTerminalSupabaseOverride(cleanUrl, cleanKey);
    resetExternalClient();
    notifyCloudKeysChanged();
    afterCredentialsSaved();
    return { ok: true, encrypted: res.encrypted };
  }
  if (isMobileShell()) {
    try {
      const loaded = await androidStore();
      if (!loaded) return { ok: false, error: "Secure storage is unavailable on this device." };
      const store = loaded.value;
      await store.set({ key: ANDROID_URL_KEY, value: cleanUrl });
      await store.set({ key: ANDROID_KEY_KEY, value: cleanKey });
      setTerminalSupabaseOverride(cleanUrl, cleanKey);
      resetExternalClient();
      notifyCloudKeysChanged();
      afterCredentialsSaved();
      return { ok: true, encrypted: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return { ok: false, error: "Cloud keys are managed by this deployment." };
}

/** Forget the saved pair — the till keeps trading locally, cloud sync stops. */
export async function removeCloudCredentials(): Promise<{ ok: boolean; error?: string }> {
  if (isWindowsShell() && window.pos?.removeCloudCredentials) {
    const res = await window.pos.removeCloudCredentials();
    if (!res.ok) return { ok: false, error: res.error ?? "Could not remove the credentials." };
    clearTerminalSupabaseOverride();
    resetExternalClient();
    notifyCloudKeysChanged();
    setSyncState({ cloudConfigured: false });
    return { ok: true };
  }
  if (isMobileShell()) {
    try {
      const loaded = await androidStore();
      if (!loaded) return { ok: false, error: "Secure storage is unavailable on this device." };
      const store = loaded.value;
      await store.remove({ key: ANDROID_URL_KEY });
      await store.remove({ key: ANDROID_KEY_KEY });
      clearTerminalSupabaseOverride();
      resetExternalClient();
      notifyCloudKeysChanged();
      setSyncState({ cloudConfigured: false });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return { ok: false, error: "Cloud keys are managed by this deployment." };
}

/**
 * Boot-time hydration: read the platform vault and point the tenant client at
 * it. Returns the status so the shell can decide whether to show the setup
 * prompt. No-op on web.
 */
export async function initCloudConfigFromShell(): Promise<CloudKeyStatus> {
  if (!isTerminalApp()) return cloudKeyStatus();
  if (isWindowsShell() && window.pos?.bootstrapCloudCredentials) {
    // The main process owns the key; ask it for the live pair through the
    // dedicated bootstrap channel so the renderer can configure its client.
    const res = await window.pos.bootstrapCloudCredentials();
    if (res.ok && res.url && res.key) {
      setTerminalSupabaseOverride(res.url, res.key);
      resetExternalClient();
    }
    return cloudKeyStatus();
  }
  const saved = await androidRead();
  if (saved) {
    setTerminalSupabaseOverride(saved.url, saved.key);
    resetExternalClient();
  }
  return cloudKeyStatus();
}

/* ------------------------- change notifications ------------------------- */

const listeners = new Set<() => void>();

export function subscribeCloudKeys(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notifyCloudKeysChanged() {
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      /* a broken listener must not break the settings flow */
    }
  }
}
