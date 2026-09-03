/**
 * Where a terminal app sends its app-server calls.
 *
 * Android and the Windows till are live clients of a hosted backend: cashier
 * sign-in, the sync relay and every other privileged operation are answered
 * there, so no privileged credential ever has to sit on the device. The only
 * thing the device needs is the backend's address, which is not a secret.
 *
 * It is stored per device:
 *   - Windows (Electron): the sealed configuration store, via the main process
 *   - Android (APK): device storage
 * and it is applied to `window.__POS_SERVER_URL__`, which `server-origin.ts`
 * reads. The web build ignores all of this and keeps using relative URLs.
 */
import { isTerminalApp } from "@/platform-config/platform";
import { isWindowsShell } from "@/platform-config/features";

const STORAGE_KEY = "pos.backend.url";

const clean = (value: unknown): string =>
  typeof value === "string" ? value.trim().replace(/\/+$/, "") : "";

/**
 * Accept what an operator would naturally type. A bare host gets `https://`,
 * a trailing slash goes, and a pasted endpoint path (`.../api/public/...`) is
 * trimmed back to the site root — the address is the site, not an endpoint.
 */
export function normaliseBackendUrl(value: string): string {
  let url = clean(value);
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  url = url.replace(/\/api(\/.*)?$/i, "");
  return url.replace(/\/+$/, "");
}


type Bridge = {
  backendUrl?: () => Promise<{ ok: boolean; url?: string }>;
  setBackendUrl?: (value: string) => Promise<{ ok: boolean; url?: string; error?: string }>;
};

function bridge(): Bridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { pos?: Bridge }).pos;
}

/** Push the value into the global the fetch helpers read. */
function apply(url: string): void {
  if (typeof window === "undefined") return;
  (window as unknown as { __POS_SERVER_URL__?: string }).__POS_SERVER_URL__ = url;
}

/**
 * There is no build-time default on purpose. A shipped APK or installer must
 * carry no address belonging to another deployment, so when the device has
 * nothing saved the address stays empty and the operator is asked for it.
 */

/** The address this device is configured to use, "" when it has none. */
export async function backendUrl(): Promise<string> {
  if (typeof window === "undefined") return "";
  if (isWindowsShell()) {
    const res = await bridge()?.backendUrl?.().catch(() => undefined);
    const saved = clean(res?.url);
    if (saved) return saved;
  } else if (isTerminalApp()) {
    try {
      const saved = clean(window.localStorage.getItem(STORAGE_KEY));
      if (saved) return saved;
    } catch {
      /* storage unavailable — the device has no address */
    }
  }
  return "";
}

/** Read the saved address and make it the one every app-server call uses. */
export async function hydrateBackendUrl(): Promise<string> {
  const url = await backendUrl();
  apply(url);
  return url;
}

export type BackendSaveResult = { ok: boolean; error?: string; url?: string };

/** Save (or clear, with an empty value) the address for this device. */
export async function saveBackendUrl(value: string): Promise<BackendSaveResult> {
  const next = normaliseBackendUrl(value);
  if (value.trim() && !next)
    return { ok: false, error: "Enter the web address of your POS site, e.g. https://pos.example.com" };
  if (isWindowsShell()) {
    const res = await bridge()
      ?.setBackendUrl?.(next)
      .catch((e: unknown) => ({ ok: false, error: (e as Error).message }));
    if (res && res.ok === false) return res;
  } else {
    try {
      if (next) window.localStorage.setItem(STORAGE_KEY, next);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  apply(next);
  return { ok: true, url: next };
}

export type BackendTestResult = {
  ok: boolean;
  /** true when the address answered but still needs an administrator */
  warn?: boolean;
  detail: string;
  /** the address that was actually tried, after tidying up what was typed */
  url?: string;
};

/**
 * Ask the address whether it is this POS backend, using the open presence
 * probe — no credential, no cloud account. The answer distinguishes the four
 * mistakes an operator actually makes: the database address, a plain website,
 * a POS server missing its central key, and a dead line.
 */
export async function testBackendUrl(value: string): Promise<BackendTestResult> {
  const url = normaliseBackendUrl(value);
  if (!url) return { ok: false, detail: "Enter the backend address first." };
  let res: Response;
  try {
    res = await fetch(`${url}/api/public/sync-health`, { method: "GET", cache: "no-store" });
  } catch (e) {
    return {
      ok: false,
      url,
      detail: `No answer from ${url} — check the address, its certificate and this device's connection (${(e as Error).message}).`,
    };
  }

  const text = await res.text().catch(() => "");
  let body: unknown = null;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    /* not JSON — handled below */
  }
  const data = (body ?? {}) as {
    serviceKey?: boolean;
    posUrl?: boolean;
    message?: string;
    hint?: string;
    code?: string;
  };

  // The central database answers its own error shape and never these flags.
  if (typeof data.serviceKey !== "boolean") {
    if (data.message || data.hint || data.code || /supabase\.co/i.test(url))
      return {
        ok: false,
        url,
        detail:
          "That is the central database address, not your POS website. Enter the web address you open the POS on, e.g. https://pos.example.com.",
      };
    if (/<html/i.test(text))
      return {
        ok: false,
        url,
        detail: `${url} serves a website, but not this POS backend. Check the address is the POS deployment.`,
      };
    return {
      ok: false,
      url,
      detail: `${url} answered ${res.status} but not as a POS backend. Check the address.`,
    };
  }

  if (!data.serviceKey)
    return {
      ok: false,
      warn: true,
      url,
      detail:
        "This is the POS backend, but it has no central database key. An administrator must set SUPABASE_URL, SUPABASE_ANON_KEY and the service key on the hosting environment.",
    };

  return { ok: true, url, detail: `${url} answered as your POS backend — sign-in and sync will work.` };
}

