/**
 * Self-hosted live updates for the Android web bundle.
 *
 * The release workflow uploads a zipped web bundle plus a small manifest to
 * the same update bucket the Windows till uses. The phone reads the manifest,
 * downloads a newer bundle into app storage and serves it from the next
 * launch, so interface fixes arrive without a Play Store release. The native
 * shell itself still updates through the APK / Google Play.
 *
 * Nothing here runs on web or Electron: every entry point returns early when
 * the app is not inside Capacitor.
 */
import { APP_VERSION } from "@/lib/app-updates";
import { isNative } from "@/platform-config/platform";
import { firstReachableUrl, httpGetBase64, httpGetJson } from "@/platforms/mobile/native-http";
import { fetchManifest, withTimeout } from "@/lib/update-manifest";

const BASE = "https://updatecms.luckycharmsdnbhd.com/pos-app";
/** Current layout first, legacy path second, for phones on older releases. */
const WEB_FEEDS = [`${BASE}/latest/android/web`, `${BASE}/android/web`];
const SIX_HOURS = 6 * 60 * 60 * 1000;
const STATE_KEY = "pos.ui.webBundle";

type Manifest = { version: string; file: string; url?: string };

type StoredBundle = { version: string; path: string };

function readState(): StoredBundle | null {
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as StoredBundle) : null;
  } catch {
    return null;
  }
}

function writeState(value: StoredBundle) {
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(value));
  } catch {
    /* preference storage full — the bundle simply re-downloads next time */
  }
}

/** "1.2.10" > "1.2.9" — plain numeric compare, missing parts count as 0. */
export function isNewerBundle(candidate: string, current: string): boolean {
  const a = candidate.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const b = current.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/** Serve a bundle downloaded on an earlier run, if there is one. */
export async function applyPendingWebBundle(): Promise<void> {
  if (typeof window === "undefined" || !isNative()) return;
  const pending = readState();
  if (!pending || !isNewerBundle(pending.version, APP_VERSION)) return;
  try {
    const { Capacitor } = (await import("@capacitor/core")) as unknown as {
      Capacitor: { setServerBasePath?: (p: string) => void };
    };
    Capacitor.setServerBasePath?.(pending.path);
  } catch {
    /* the packaged bundle stays in use */
  }
}

/**
 * Check the bucket and download a newer bundle in the background. The new
 * files are only served from the next launch, so a shift is never interrupted.
 */
export async function checkWebBundle(): Promise<string | null> {
  if (typeof window === "undefined" || !isNative() || !navigator.onLine) return null;
  try {
    let manifest: Manifest | null = null;
    let feed = WEB_FEEDS[0]!;

    // Preferred: the shared self-hosted manifest, which carries `bundleUrl`.
    const shared = await fetchManifest();
    if (shared?.bundleUrl) {
      manifest = {
        version: shared.version,
        file: shared.bundleUrl.split("/").pop() || `web-${shared.version}.zip`,
        url: shared.bundleUrl,
      };
    }

    if (!manifest) {
      for (const candidate of WEB_FEEDS) {
        try {
          manifest = await withTimeout(httpGetJson<Manifest>(`${candidate}/latest.json`));
          feed = candidate;
          break;
        } catch {
          /* try the next path */
        }
      }
    }
    const current = readState()?.version ?? APP_VERSION;
    if (!manifest?.version || !isNewerBundle(manifest.version, current)) return null;

    const candidates = [
      manifest.url,
      `${feed}/${manifest.file}`,
      ...WEB_FEEDS.map((f) => `${f}/${manifest!.file}`),
    ].filter((u): u is string => Boolean(u));
    const url = (await firstReachableUrl(candidates)) ?? candidates[0]!;
    const base64 = await httpGetBase64(url);
    if (!base64) return null;

    const { Filesystem, Directory } = (await import("@capacitor/filesystem")) as unknown as {
      Filesystem: {
        writeFile: (o: {
          path: string;
          data: string;
          directory: string;
          recursive?: boolean;
        }) => Promise<{ uri: string }>;
      };
      Directory: { Data: string };
    };
    const written = await Filesystem.writeFile({
      path: `web/${manifest.version}/${manifest.file}`,
      data: base64,
      directory: Directory.Data,
      recursive: true,
    });
    writeState({ version: manifest.version, path: written.uri.replace(/\/[^/]+$/, "") });
    return manifest.version;
  } catch {
    return null;
  }
}

/** Start the periodic background check (called once from the app shell). */
export function startWebBundleChecks(): () => void {
  if (typeof window === "undefined" || !isNative()) return () => {};
  void checkWebBundle();
  const timer = window.setInterval(() => void checkWebBundle(), SIX_HOURS);
  return () => window.clearInterval(timer);
}
