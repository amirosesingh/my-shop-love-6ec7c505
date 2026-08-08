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
import { describeNetworkError, httpGetBase64, httpGetJson } from "./native-http";

const BASE = "https://updatecms.luckycharmsdnbhd.com/pos-app";
/** Current layout first, legacy path second, for phones on older releases. */
const FEEDS = [`${BASE}/latest/android`, `${BASE}/android`];
const SIX_HOURS = 6 * 60 * 60 * 1000;
const DISMISS_KEY = "pos.android.update.dismissed";

export type AndroidUpdateState = {
  supported: boolean;
  installed: string;
  latest: string | null;
  file: string | null;
  feed: string | null;
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
  feed: null,
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

async function fetchLatest(): Promise<{ version: string; file: string; feed: string }> {
  let last: unknown = new Error("No update feed is reachable.");
  for (const feed of FEEDS) {
    try {
      const data = await httpGetJson<{ version?: string; file?: string }>(`${feed}/latest.json`);
      if (!data?.version) throw new Error("The update feed did not report a version.");
      return {
        version: data.version,
        file: data.file || `NorthwindPOS-${data.version}.apk`,
        feed,
      };
    } catch (err) {
      last = err;
    }
  }
  throw new Error(describeNetworkError(last));
}

/** Download the APK into app storage and open Android's package installer. */
async function downloadAndInstall(
  file: string,
  feed: string,
  onProgress: (pct: number) => void,
) {
  const [{ Filesystem, Directory }, { FileOpener }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor-community/file-opener"),
  ]);

  const base64 = await httpGetBase64(`${feed}/${encodeURIComponent(file)}`, onProgress);

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
      const { version, file, feed } = await fetchLatest();
      setState((s) => ({
        ...s,
        checking: false,
        latest: version,
        file,
        feed,
        lastChecked: new Date(),
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        checking: false,
        error: describeNetworkError(err),
        lastChecked: new Date(),
      }));
    }
  }, []);

  const install = useCallback(async () => {
    setState((s) => ({ ...s, downloading: true, percent: 0, error: null }));
    try {
      const file = state.file;
      if (!file) throw new Error("No update file is available yet.");
      await downloadAndInstall(file, state.feed ?? FEEDS[0]!, (percent: number) =>
        setState((s) => ({ ...s, percent })),
      );
      setState((s) => ({ ...s, downloading: false, percent: 100 }));
    } catch (err) {
      setState((s) => ({
        ...s,
        downloading: false,
        error: describeNetworkError(err),
      }));
    }
  }, [state.file, state.feed]);

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