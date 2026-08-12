/**
 * HTTP helpers that work inside the Android shell.
 *
 * The Capacitor webview serves the app from a local origin, so a plain
 * `fetch()` to the update bucket is a cross-origin request and the webview
 * rejects it with a bare "Failed to fetch". Capacitor's native HTTP plugin
 * performs the request outside the webview, where CORS does not apply, so
 * every update-feed read and download goes through here.
 */
import { isNative } from "./native";

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
  if (/failed to fetch|network ?error|load failed/i.test(msg)) {
    return "Could not reach the update server. Check the internet connection on this device.";
  }
  return msg;
}

/** GET a JSON document, using the native bridge on Android. */
export async function httpGetJson<T>(url: string): Promise<T> {
  const bust = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
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
