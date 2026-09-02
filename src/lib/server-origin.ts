/**
 * Where this build should send app-server calls.
 *
 * The Android APK serves the whole app from a local origin inside the phone,
 * so a relative request to `/api/...` never reaches a real server — the local
 * static server answers with the app shell instead. The Windows till has the
 * same problem in reverse: its bundled local server used to answer privileged
 * calls itself, which meant keeping a privileged key on a shop counter.
 *
 * Both therefore send app-server calls to the hosted backend, whose address
 * is configured per device (`backend-config.ts`, Recovery settings) or baked
 * in with `VITE_POS_SERVER_URL`. Web keeps using relative URLs.
 */
import { isElectron, isNative } from "@/platform-config/platform";

function configured(): string {
  const fromBuild = (import.meta.env["VITE_POS_SERVER_URL"] as string | undefined) ?? "";
  const fromRuntime =
    typeof window === "undefined"
      ? ""
      : ((window as unknown as { __POS_SERVER_URL__?: string }).__POS_SERVER_URL__ ?? "");
  return (fromRuntime || fromBuild).trim().replace(/\/+$/, "");
}

/** Absolute origin for app-server calls, or "" when relative URLs are right. */
export function serverOrigin(): string {
  if (typeof window === "undefined") return "";
  if (!isNative() && !isElectron()) return "";
  return configured();
}

/** True when a terminal app has no server to talk to for app-server endpoints. */
export function serverUnreachableOnDevice(): boolean {
  return (isNative() || isElectron()) && !configured();
}

/** Resolve an app path against the origin this shell should use. */
export function serverUrl(path: string): string {
  const origin = serverOrigin();
  if (!origin) return path;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

/** `fetch` that lands on a real server even inside the Android shell. */
export function posFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(serverUrl(path), init);
}