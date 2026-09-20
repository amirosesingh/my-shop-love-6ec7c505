const os = require("node:os");
const { execFile } = require("node:child_process");

function unique(values) { return [...new Set(values.filter(Boolean))]; }

/**
 * Safe local-only discovery. UDP service resolution is deliberately excluded:
 * the connection architecture accepts a hostname plus
 * explicit TCP port. We only ask Windows whether its default SQL Server
 * service exists, then offer aliases for this computer.
 */
function discoverLocalSqlServers({ run = execFile, hostname = os.hostname(), platform = process.platform } = {}) {
  if (platform !== "win32") {
    return Promise.resolve({ ok: false, servers: [], error: "Server discovery is available only in the Windows desktop app." });
  }
  return new Promise((resolve) => {
    run("sc.exe", ["query", "MSSQLSERVER"], { windowsHide: true, timeout: 5_000 }, (error, stdout = "") => {
      const output = String(stdout);
      const installed = !error || /SERVICE_NAME:\s*MSSQLSERVER|STATE\s*:/i.test(output);
      if (!installed) return resolve({ ok: true, servers: [] });
      const status = /STATE\s*:\s*\d+\s+RUNNING/i.test(output) ? "running" : "installed";
      const servers = unique(["localhost", "127.0.0.1", hostname]).map((host) => ({
        host,
        label: host === hostname ? `${host} (this computer)` : host,
        status,
      }));
      resolve({ ok: true, servers });
    });
  });
}

module.exports = { discoverLocalSqlServers };
