/**
 * One-click install of a missing Microsoft SQL Server driver.
 *
 * Windows Integrated authentication goes through msnodesqlv8, which needs a
 * Microsoft ODBC driver present on the PC. When the connection ladder fails
 * with EDRIVER the operator used to be sent to a download page; this module
 * downloads the pinned official installer, verifies its SHA-256 fingerprint
 * and hands it to msiexec so Windows shows its normal elevation prompt.
 *
 * Invariants (never relaxed):
 *  - only the pinned https download.microsoft.com / go.microsoft.com URL,
 *  - the checksum is always verified and there is no "install anyway" path,
 *  - the UAC prompt is always shown; nothing here tries to suppress it.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const { logConnection, installedOdbcDrivers } = require("./pool.cjs");

const ALLOWED_HOSTS = new Set(["download.microsoft.com", "go.microsoft.com"]);
const CATALOG_FILE = path.join(__dirname, "driver-catalog.json");

/* --------------------------------- catalogue -------------------------------- */

function readCatalog() {
  try {
    const raw = JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8"));
    const drivers = Array.isArray(raw?.drivers) ? raw.drivers : [];
    return { catalogVersion: Number(raw?.catalogVersion) || 0, drivers };
  } catch (err) {
    logConnection("driver.catalog.unreadable", { error: err?.message ?? String(err) });
    return { catalogVersion: 0, drivers: [] };
  }
}

/** Refuses anything that is not an https Microsoft download URL. */
function urlAllowed(url) {
  try {
    const parsed = new URL(String(url));
    return parsed.protocol === "https:" && ALLOWED_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function findEntry(id) {
  return readCatalog().drivers.find((d) => d.id === id) ?? null;
}

/** Catalogue plus what the registry says is already installed. */
function listDrivers(deps = {}) {
  const list = (deps.refreshDrivers ?? installedOdbcDrivers)() ?? [];
  const lower = list.map((n) => String(n).toLowerCase());
  const { catalogVersion, drivers } = readCatalog();
  return {
    ok: true,
    platform: deps.platform ?? process.platform,
    supported: (deps.platform ?? process.platform) === "win32",
    catalogVersion,
    installed: list,
    drivers: drivers.map((d) => ({
      id: d.id,
      kind: d.kind,
      name: d.name,
      version: d.version,
      manualUrl: d.manualUrl,
      recommended: !!d.recommended,
      installed: lower.includes(String(d.name).toLowerCase()),
    })),
  };
}

/* --------------------------------- download --------------------------------- */

/**
 * Streams the installer to disk through the main process (proxy-safe, and not
 * subject to the window's CORS rules). Reports whole-percent progress only.
 */
function downloadToFile(url, target, onProgress) {
  return new Promise((resolve, reject) => {
    let request;
    try {
      const { net } = require("electron");
      request = net.request({ method: "GET", url, redirect: "follow" });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    const timer = setTimeout(() => {
      try {
        request.abort();
      } catch {
        /* already gone */
      }
      reject(new Error("The download did not finish in time."));
    }, 10 * 60 * 1000);
    request.on("response", (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        clearTimeout(timer);
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const total = Number(res.headers["content-length"]?.[0] ?? res.headers["content-length"] ?? 0);
      let received = 0;
      let lastPercent = -1;
      const out = fs.createWriteStream(target);
      res.on("data", (chunk) => {
        received += chunk.length;
        out.write(chunk);
        if (!total) return;
        const percent = Math.min(99, Math.round((received / total) * 100));
        if (percent !== lastPercent) {
          lastPercent = percent;
          onProgress?.(percent);
        }
      });
      res.on("end", () => {
        out.end(() => {
          clearTimeout(timer);
          onProgress?.(100);
          resolve({ bytes: received });
        });
      });
      res.on("error", (err) => {
        clearTimeout(timer);
        out.destroy();
        reject(err);
      });
    });
    request.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    request.end();
  });
}

/** SHA-256 of a file already on disk. */
function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/* --------------------------------- installer -------------------------------- */

/**
 * `msiexec /i <msi> /qn /norestart`. The MSI's own UI is silent; Windows still
 * raises its elevation prompt because installing a driver needs admin rights.
 */
function runMsi(file) {
  return new Promise((resolve) => {
    const child = spawn("msiexec", ["/i", file, "/qn", "/norestart"], {
      windowsHide: true,
      stdio: "ignore",
    });
    child.on("error", (err) => resolve({ exitCode: -1, error: err?.message ?? String(err) }));
    child.on("close", (code) => resolve({ exitCode: code === null ? -1 : code }));
  });
}

/** Windows installer exit codes that matter to an operator. */
function describeExit(exitCode) {
  if (exitCode === 0) return { ok: true, code: "OK", restartRequired: false };
  if (exitCode === 3010 || exitCode === 1641)
    return { ok: true, code: "OK_RESTART", restartRequired: true };
  if (exitCode === 1602 || exitCode === 1223)
    return {
      ok: false,
      code: "ECANCELLED",
      restartRequired: false,
      error: "Installation was cancelled, so the driver is still missing.",
    };
  return {
    ok: false,
    code: "EEXIT",
    restartRequired: false,
    error: `The Windows installer stopped with exit code ${exitCode}.`,
  };
}

let running = null;

/**
 * Download -> verify -> install -> re-read the installed drivers.
 * Always resolves with a structured result; it never throws at the caller.
 */
async function installDriver(id, options = {}) {
  const deps = options.deps ?? {};
  const onProgress = options.onProgress ?? (() => {});
  const platform = deps.platform ?? process.platform;
  const download = deps.download ?? downloadToFile;
  const hash = deps.hash ?? hashFile;
  const runInstaller = deps.runInstaller ?? runMsi;
  const refreshDrivers = deps.refreshDrivers ?? installedOdbcDrivers;
  const tmpDir = deps.tmpDir ?? path.join(os.tmpdir(), "pos-driver");

  if (running) {
    return { ok: false, code: "EBUSY", error: "A driver installation is already running." };
  }
  if (platform !== "win32") {
    return {
      ok: false,
      code: "EPLATFORM",
      error: "Driver installation is only available on Windows.",
    };
  }
  const entry = findEntry(id);
  if (!entry) {
    return { ok: false, code: "ENOENTRY", error: `Unknown driver "${id}".` };
  }
  if (!urlAllowed(entry.url) || !/^[0-9a-f]{64}$/i.test(String(entry.sha256 ?? ""))) {
    logConnection("driver.blocked", { id, reason: "url-or-checksum-not-pinned" });
    return {
      ok: false,
      code: "EURL",
      error: "This driver is not pinned to an official Microsoft download, so it will not be installed.",
      manualUrl: entry.manualUrl,
    };
  }

  running = id;
  const file = path.join(tmpDir, `${entry.id}.msi`);
  const cleanup = () => {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      /* a leftover temp file must never fail the install */
    }
  };
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    logConnection("driver.download.start", { id, name: entry.name, version: entry.version });
    onProgress({ phase: "download", percent: 0 });
    try {
      await download(entry.url, file, (percent) => onProgress({ phase: "download", percent }));
    } catch (err) {
      cleanup();
      const error = err?.message ?? String(err);
      logConnection("driver.download.fail", { id, error });
      return {
        ok: false,
        code: "EDOWNLOAD",
        error: `Could not download the driver — ${error}`,
        manualUrl: entry.manualUrl,
      };
    }
    logConnection("driver.download.end", { id });

    onProgress({ phase: "verify", percent: 100 });
    const actual = String(await hash(file)).toLowerCase();
    const expected = String(entry.sha256).toLowerCase();
    const match = actual === expected;
    logConnection("driver.checksum", {
      id,
      match,
      expected: expected.slice(0, 12),
      actual: actual.slice(0, 12),
    });
    if (!match) {
      cleanup();
      return {
        ok: false,
        code: "ECHECKSUM",
        error:
          "The downloaded file does not match Microsoft's expected fingerprint, so it was deleted and NOT installed.",
        manualUrl: entry.manualUrl,
      };
    }

    onProgress({ phase: "install", percent: 100 });
    logConnection("driver.install.start", { id });
    const { exitCode, error: spawnError } = await runInstaller(file);
    logConnection("driver.install.end", { id, exitCode, error: spawnError ?? null });
    cleanup();
    const outcome = describeExit(exitCode);
    const installed = (refreshDrivers() ?? []);
    logConnection("driver.installed-list", { id, installed });
    return {
      ...outcome,
      id,
      name: entry.name,
      exitCode,
      installed,
      manualUrl: outcome.ok ? undefined : entry.manualUrl,
      error: outcome.ok ? undefined : spawnError ? `${outcome.error} (${spawnError})` : outcome.error,
    };
  } catch (err) {
    cleanup();
    const error = err?.message ?? String(err);
    logConnection("driver.install.crash", { id, error });
    return { ok: false, code: "EFAILED", error, manualUrl: entry.manualUrl };
  } finally {
    running = null;
  }
}

/** True while an installation owns the temp folder. */
const isInstalling = () => running !== null;

module.exports = {
  readCatalog,
  listDrivers,
  installDriver,
  isInstalling,
  urlAllowed,
  describeExit,
  hashFile,
  downloadToFile,
};
