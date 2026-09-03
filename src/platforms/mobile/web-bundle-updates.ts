/**
 * Self-hosted live updates for the Android web bundle.
 *
 * The release workflow uploads a zipped web bundle plus a small manifest to
 * the same update bucket the Windows till uses. The phone reads the manifest,
 * downloads a newer bundle into app storage and serves it from the next
 * launch, so interface fixes arrive without a Play Store release. The native
 * shell itself still updates through the APK / Google Play.
 *
 * Compatibility: a bundle is only accepted and only served when it declares a
 * bundle epoch at or above the one compiled into this shell. Bundles built
 * before the platform configuration isolation fix declare none, so they are
 * rejected, deleted from app storage and never served — the clean assets
 * inside the APK are used instead. See src/lib/bundle-epoch.ts.
 *
 * Nothing here runs on web or Electron: every entry point returns early when
 * the app is not inside Capacitor.
 */
import { APP_VERSION } from "@/lib/app-updates";
import { isNative } from "@/platform-config/platform";
import { firstReachableUrl, httpGetBase64, httpGetJson } from "@/platforms/mobile/native-http";
import { fetchManifest, withTimeout } from "@/lib/update-manifest";
import { BUNDLE_EPOCH, isBundleEpochCompatible } from "@/lib/bundle-epoch";

const BASE = "https://updatecms.luckycharmsdnbhd.com/pos-app";
/** Current layout first, legacy path second, for phones on older releases. */
const WEB_FEEDS = [`${BASE}/latest/android/web`, `${BASE}/android/web`];
const SIX_HOURS = 6 * 60 * 60 * 1000;
const STATE_KEY = "pos.ui.webBundle";

type Manifest = { version: string; file: string; url?: string; bundleEpoch?: number };

type StoredBundle = { version: string; path: string; epoch?: number };

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

function clearState() {
  try {
    window.localStorage.removeItem(STATE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Remove a downloaded bundle from app storage; failures are not fatal. */
async function removeStoredBundle(stored: StoredBundle): Promise<void> {
  try {
    const { Filesystem, Directory } = (await import("@capacitor/filesystem")) as unknown as {
      Filesystem: {
        rmdir: (o: { path: string; directory: string; recursive?: boolean }) => Promise<void>;
      };
      Directory: { Data: string };
    };
    await Filesystem.rmdir({
      path: `web/${stored.version}`,
      directory: Directory.Data,
      recursive: true,
    });
  } catch {
    /* already gone, or the platform refused — the state is cleared regardless */
  }
}

/** Delete an unusable bundle and forget it, so the APK assets are used. */
export async function purgeStoredBundle(stored: StoredBundle | null): Promise<void> {
  clearState();
  if (stored) await removeStoredBundle(stored);
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

/**
 * Decide what to do with a bundle already sitting in app storage.
 * Pure, so the upgrade scenario can be tested without a device.
 */
export function bundleDecision(
  stored: StoredBundle | null,
  shellVersion = APP_VERSION,
  shellEpoch = BUNDLE_EPOCH,
): "none" | "serve" | "purge" {
  if (!stored?.version || !stored.path) return "none";
  if (!isBundleEpochCompatible(stored.epoch, shellEpoch)) return "purge";
  if (!isNewerBundle(stored.version, shellVersion)) return "purge";
  return "serve";
}

/** Serve a bundle downloaded on an earlier run, if there is a usable one. */
export async function applyPendingWebBundle(): Promise<void> {
  if (typeof window === "undefined" || !isNative()) return;
  const pending = readState();
  const decision = bundleDecision(pending);
  if (decision === "none") return;
  if (decision === "purge") {
    // An old (pre-epoch) or superseded bundle: remove it instead of serving
    // it, including one downloaded before this APK was installed.
    await purgeStoredBundle(pending);
    return;
  }
  try {
    const { Capacitor } = (await import("@capacitor/core")) as unknown as {
      Capacitor: { setServerBasePath?: (p: string) => void };
    };
    Capacitor.setServerBasePath?.(pending!.path);
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
        bundleEpoch: shared.bundleEpoch,
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
    // A bundle from before the configuration isolation fix declares no epoch:
    // never download it, whatever version it claims.
    if (!isBundleEpochCompatible(manifest?.bundleEpoch)) return null;
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
    writeState({
      version: manifest.version,
      path: written.uri.replace(/\/[^/]+$/, ""),
      epoch: Math.max(BUNDLE_EPOCH, Number(manifest.bundleEpoch) || 0),
    });
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
