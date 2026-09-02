/**
 * HTTP helpers that work inside the Android shell.
 *
 * The Capacitor webview serves the app from a local origin, so a plain
 * `fetch()` to the update bucket is a cross-origin request and the webview
 * rejects it with a bare "Failed to fetch". Capacitor's native HTTP plugin
 * performs the request outside the webview, where CORS does not apply, so
 * every update-feed read and download goes through here.
 */
import { isElectron, isNative } from "@/platforms/mobile/native";

/**
 * Warn the operator once per session when the native network bridge cannot
 * serve a request and we quietly fall back to the webview's own `fetch`.
 * Without this the failure is invisible and the slower path looks like a bug.
 */
const warned = new Set<string>();

function warnBridgeUnavailable(operation: string, err: unknown) {
  const detail = err instanceof Error ? err.message : String(err);
  console.warn(`[native-http] ${operation}: native bridge unavailable — ${detail}`);
  if (typeof window === "undefined" || warned.has(operation)) return;
  warned.add(operation);
  void import("sonner")
    .then(({ toast }) =>
      toast.warning("Native network bridge unavailable", {
        description: `${operation} is not supported by this device shell — retrying through the app browser.`,
      }),
    )
    .catch(() => {});
}

/**
 * Desktop bridge for the same job: the till window is served from
 * 127.0.0.1, so the update bucket is cross-origin and the browser blocks the
 * response. The main process has no such restriction.
 */
type DesktopNet = {
  netGetJson?: (url: string) => Promise<{ ok: boolean; status?: number; data?: unknown; error?: string }>;
  netHead?: (url: string) => Promise<{ ok: boolean; status?: number; error?: string }>;
  netGetBinary?: (
    url: string,
  ) => Promise<{ ok: boolean; status?: number; base64?: string; error?: string }>;
};

function desktopNet(): DesktopNet | null {
  if (!isElectron() || typeof window === "undefined") return null;
  const bridge = (window as unknown as { pos?: DesktopNet }).pos;
  return bridge && typeof bridge.netGetJson === "function" ? bridge : null;
}

type CapHttp = {
  request: (o: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    responseType?: "text" | "json" | "blob" | "arraybuffer";
    connectTimeout?: number;
    readTimeout?: number;
  }) => Promise<{ status: number; data: unknown; headers?: Record<string, string> }>;
};

/**
 * Capacitor plugin handles are Proxies that answer *every* property with a
 * native call — including `then`. Returning one straight out of an `async`
 * function makes JavaScript treat it as a thenable and invoke `http.then(...)`,
 * which the bridge reports as "http.then is not implemented on Android".
 * Wrapping it in a plain object keeps the plugin away from the await machinery.
 */
async function nativeHttp(): Promise<{ http: CapHttp } | null> {
  try {
    const mod = (await import("@capacitor/core")) as unknown as {
      CapacitorHttp?: CapHttp;
      Capacitor?: { isPluginAvailable?: (name: string) => boolean };
    };
    const available = mod.Capacitor?.isPluginAvailable?.("CapacitorHttp") ?? true;
    const http = mod.CapacitorHttp;
    if (!available || !http || typeof http.request !== "function") return null;
    return { http };
  } catch {
    return null;
  }
}

/** Turn any transport failure into a sentence an operator can act on. */
export function describeNetworkError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // A 404/410 is a missing file on the server, not a dead connection — saying
  // "could not reach the server" sends the operator chasing the wrong problem.
  if (/HTTP 40[0-9]|HTTP 41[0-9]/i.test(msg)) {
    const code = msg.match(/HTTP (\d{3})/i)?.[1] ?? "404";
    if (code === "404" || code === "410") {
      return `The update file is missing on the server (HTTP ${code}). The release may still be uploading.`;
    }
    return `The update server refused the request (HTTP ${code}).`;
  }
  if (/failed to fetch|network ?error|load failed/i.test(msg)) {
    return "Could not reach the update server. Check the internet connection on this device.";
  }
  return msg;
}

/** True when the URL answers with a downloadable file. */
export async function httpExists(url: string): Promise<boolean> {
  try {
    const desktop = desktopNet();
    if (desktop?.netHead) {
      const res = await desktop.netHead(url);
      return !!res?.ok;
    }
    if (isNative()) {
      const native = await nativeHttp();
      if (native) {
        const res = await native.http.request({
          url,
          method: "HEAD",
          connectTimeout: 10000,
          readTimeout: 15000,
        });
        return res.status >= 200 && res.status < 300;
      }
    }
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * First URL in the list that actually exists. Release layouts have moved over
 * time (and one platform's cleanup can remove another's folder), so downloads
 * try the published link first and fall back to the older locations.
 */
export async function firstReachableUrl(urls: string[]): Promise<string | null> {
  for (const url of urls.filter(Boolean)) {
    if (await httpExists(url)) return url;
  }
  return null;
}

/** GET a JSON document, using the native bridge on Android. */
export async function httpGetJson<T>(url: string): Promise<T> {
  const bust = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
  const desktop = desktopNet();
  if (desktop?.netGetJson) {
    const res = await desktop.netGetJson(bust);
    if (res?.ok && res.data !== undefined) {
      return (typeof res.data === "string" ? JSON.parse(res.data) : res.data) as T;
    }
    if (res?.status) throw new Error(`Update check failed (HTTP ${res.status}).`);
    throw new Error(res?.error || "Could not reach the update server.");
  }
  if (isNative()) {
    const native = await nativeHttp();
    if (native) {
      const { http } = native;
      try {
      const res = await http.request({
        url: bust,
        method: "GET",
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
        responseType: "json",
        connectTimeout: 15000,
        readTimeout: 30000,
      });
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`Update check failed (HTTP ${res.status}).`);
      }
      return (typeof res.data === "string" ? JSON.parse(res.data) : res.data) as T;
      } catch (err) {
        // A bridge that is missing or misbehaving must not end the request:
        // fall through to the webview's own fetch below.
        if (!/not implemented/i.test(err instanceof Error ? err.message : String(err))) throw err;
        warnBridgeUnavailable("Update check", err);
      }
    }
  }
  const res = await fetch(bust, { cache: "no-store" });
  if (!res.ok) throw new Error(`Update check failed (HTTP ${res.status}).`);
  return (await res.json()) as T;
}

/** GET a binary file as base64, using the native bridge on Android. */
export async function httpGetBase64(
  url: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const desktop = desktopNet();
  if (desktop?.netGetBinary) {
    onProgress?.(5);
    const res = await desktop.netGetBinary(url);
    if (res?.ok && res.base64) {
      onProgress?.(100);
      return res.base64;
    }
    if (res?.status) throw new Error(`Download failed (HTTP ${res.status}).`);
    throw new Error(res?.error || "Could not reach the update server.");
  }
  if (isNative()) {
    const native = await nativeHttp();
    if (native) {
      const { http } = native;
      onProgress?.(5);
      try {
        const res = await http.request({
        url,
        method: "GET",
        responseType: "blob",
        connectTimeout: 15000,
        readTimeout: 300000,
        });
        if (res.status < 200 || res.status >= 300) {
          throw new Error(`Download failed (HTTP ${res.status}).`);
        }
        onProgress?.(100);
        // The native bridge already hands back base64 for blob responses.
        return String(res.data);
      } catch (err) {
        if (!/not implemented/i.test(err instanceof Error ? err.message : String(err))) throw err;
        warnBridgeUnavailable("Update download", err);
      }
    }
  }

  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status}).`);
  const total = Number(res.headers.get("content-length") || 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      if (total) onProgress?.(Math.round((received / total) * 100));
    }
  }
  const blob = new Blob(chunks as BlobPart[]);
  return await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Could not read the downloaded file."));
    fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
    fr.readAsDataURL(blob);
  });
}
