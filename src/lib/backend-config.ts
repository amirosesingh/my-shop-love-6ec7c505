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
import { isElectron, isTerminalApp } from "@/platforms/mobile/native";

const STORAGE_KEY = "pos.backend.url";

const clean = (value: unknown): string =>
  typeof value === "string" ? value.trim().replace(/\/+$/, "") : "";

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

/** The build-time default, used when the device has nothing saved. */
function baked(): string {
  return clean(import.meta.env["VITE_POS_SERVER_URL"] as string | undefined);
}

/** The address this device is configured to use, "" when it has none. */
export async function backendUrl(): Promise<string> {
  if (typeof window === "undefined") return "";
  if (isElectron()) {
    const res = await bridge()?.backendUrl?.().catch(() => undefined);
    const saved = clean(res?.url);
    if (saved) return saved;
  } else if (isTerminalApp()) {
    try {
      const saved = clean(window.localStorage.getItem(STORAGE_KEY));
      if (saved) return saved;
    } catch {
      /* storage unavailable — fall through to the build value */
    }
  }
  return baked();
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
  const next = clean(value);
  if (next && !/^https?:\/\/.+/i.test(next))
    return { ok: false, error: "Enter a full address starting with https://" };
  if (isElectron()) {
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
  apply(next || baked());
  return { ok: true, url: next || baked() };
}

/**
 * Ask the backend whether it is alive, without any credential. Used by the
 * recovery screen so an operator can tell a wrong address from a dead line.
 */
export async function testBackendUrl(value: string): Promise<{ ok: boolean; detail: string }> {
  const url = clean(value);
  if (!url) return { ok: false, detail: "Enter the backend address first." };
  try {
    const res = await fetch(`${url}/api/public/health-metadata`, { method: "GET" });
    if (res.ok) return { ok: true, detail: "The backend answered — this address works." };
    return { ok: false, detail: `The backend answered ${res.status}. Check the address.` };
  } catch (e) {
    return { ok: false, detail: `No answer from ${url}: ${(e as Error).message}` };
  }
}
