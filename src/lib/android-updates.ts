/**
 * Self-update for the Android build, mirroring the Windows till.
 *
 * The release workflow uploads `NorthwindPOS-<version>.apk` and a small
 * `latest.json` to the same update bucket the desktop app uses. The phone
 * reads that file, compares versions, downloads the APK and hands it to
 * Android's installer. Nothing here runs on web or Electron.
 */
import { useCallback, useEffect, useState } from "react";
import { APP_VERSION } from "./app-updates";
import { isNative, isAndroid } from "./native";

const FEED = "https://updatecms.luckycharmsdnbhd.com/pos-app/android";
const SIX_HOURS = 6 * 60 * 60 * 1000;
const DISMISS_KEY = "pos.android.update.dismissed";

export type AndroidUpdateState = {
  supported: boolean;
  installed: string;
  latest: string | null;
  file: string | null;
  checking: boolean;
  downloading: boolean;
  percent: number;
  error: string | null;
  lastChecked: Date | null;
};

const INITIAL: AndroidUpdateState = {
  supported: false,
  installed: APP_VERSION,
  latest: null,
  file: null,
  checking: false,
  downloading: false,
  percent: 0,
  error: null,
  lastChecked: null,
};

/** "1.2.10" > "1.2.9" — plain numeric compare, missing parts count as 0. */
export function isNewer(candidate: string, current: string): boolean {
  const a = candidate.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const b = current.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

async function fetchLatest(): Promise<{ version: string; file: string }> {
  const res = await fetch(`${FEED}/latest.json?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Update check failed (HTTP ${res.status})`);
  const data = (await res.json()) as { version?: string; file?: string };
  if (!data.version) throw new Error("The update feed did not report a version.");
  return { version: data.version, file: data.file || `NorthwindPOS-${data.version}.apk` };
}

/** Download the APK into app storage and open Android's package installer. */
async function downloadAndInstall(file: string, onProgress: (pct: number) => void) {
  const [{ Filesystem, Directory }, { FileOpener }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor-community/file-opener"),
  ]);

  const res = await fetch(`${FEED}/${encodeURIComponent(file)}`);
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`);
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
      if (total) onProgress(Math.round((received / total) * 100));
    }
  }
  const blob = new Blob(chunks as BlobPart[], { type: "application/vnd.android.package-archive" });
  const base64 = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Could not read the downloaded file."));
    fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
    fr.readAsDataURL(blob);
  });

  await Filesystem.writeFile({ path: file, data: base64, directory: Directory.Cache });
  const { uri } = await Filesystem.getUri({ path: file, directory: Directory.Cache });
  await FileOpener.open({
    filePath: uri,
    contentType: "application/vnd.android.package-archive",
  });
}

export function useAndroidUpdates() {
  const [state, setState] = useState<AndroidUpdateState>(INITIAL);

  const check = useCallback(async () => {
    if (!isNative() || !isAndroid()) return;
    setState((s) => ({ ...s, checking: true, error: null }));
    try {
      const { version, file } = await fetchLatest();
      setState((s) => ({
        ...s,
        checking: false,
        latest: version,
        file,
        lastChecked: new Date(),
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        checking: false,
        error: err instanceof Error ? err.message : String(err),
        lastChecked: new Date(),
      }));
    }
  }, []);

  const install = useCallback(async () => {
    setState((s) => ({ ...s, downloading: true, percent: 0, error: null }));
    try {
      const file = state.file;
      if (!file) throw new Error("No update file is available yet.");
      await downloadAndInstall(file, (percent) => setState((s) => ({ ...s, percent })));
      setState((s) => ({ ...s, downloading: false, percent: 100 }));
    } catch (err) {
      setState((s) => ({
        ...s,
        downloading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [state.file]);

  useEffect(() => {
    if (!isNative() || !isAndroid()) return;
    setState((s) => ({ ...s, supported: true }));
    void check();
    const timer = setInterval(() => void check(), SIX_HOURS);
    return () => clearInterval(timer);
  }, [check]);

  const available = Boolean(state.latest && isNewer(state.latest, state.installed));
  return { state, available, check, install };
}

export function dismissAndroidUpdate(version: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(DISMISS_KEY, version);
}

export function isAndroidUpdateDismissed(version: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DISMISS_KEY) === version;
}