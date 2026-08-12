/**
 * Where this build should send app-server calls.
 *
 * The Android APK serves the whole app from a local origin inside the phone,
 * so a relative request to `/api/...` or to a server function never reaches a
 * real server — the local static server answers with the app shell instead,
 * and the caller ends up parsing HTML. Bake the hosted POS address into the
 * APK (`VITE_POS_SERVER_URL`) and every such call is sent there.
 *
 * Web and Electron builds keep using relative URLs, so nothing changes there.
 */
import { isNative } from "./native";

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
  if (!isNative()) return "";
  return configured();
}

/** True when the phone has no server to talk to for app-server endpoints. */
export function serverUnreachableOnDevice(): boolean {
  return isNative() && !configured();
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