const os = require("node:os");
const { execFile } = require("node:child_process");

// This reads the local SQL Server instance registry and service state only.
// It intentionally avoids discovery protocols and does not probe the LAN.
const DISCOVERY_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$instances = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL' -ErrorAction SilentlyContinue
if (-not $instances) { '[]'; exit 0 }
$rows = foreach ($property in $instances.PSObject.Properties) {
  if ($property.Name -like 'PS*') { continue }
  $instanceName = $property.Name
  $instanceId = [string]$property.Value
  $tcp = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\$instanceId\MSSQLServer\SuperSocketNetLib\Tcp\IPAll" -ErrorAction SilentlyContinue
  $staticPort = 0
  $dynamicPort = 0
  [void][int]::TryParse([string]$tcp.TcpPort, [ref]$staticPort)
  [void][int]::TryParse([string]$tcp.TcpDynamicPorts, [ref]$dynamicPort)
  $serviceName = if ($instanceName -eq 'MSSQLSERVER') { 'MSSQLSERVER' } else { 'MSSQL$' + $instanceName }
  $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
  [pscustomobject]@{
    instanceName = $instanceName
    serviceName = $serviceName
    status = if ($service.Status -eq 'Running') { 'running' } else { 'installed' }
    port = if ($staticPort -gt 0) { $staticPort } elseif ($dynamicPort -gt 0) { $dynamicPort } else { $null }
  }
}
@($rows) | ConvertTo-Json -Compress
`;

function parseDiscoveryOutput(stdout, hostname) {
  const value = JSON.parse(String(stdout || "[]"));
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  return rows
    .filter((row) => row && typeof row.instanceName === "string")
    .map((row) => {
      const port = Number(row.port);
      const instanceName = row.instanceName.trim();
      return {
        host: hostname,
        serverName: hostname,
        instanceName,
        serviceName: String(row.serviceName || ""),
        label:
          instanceName === "MSSQLSERVER"
            ? `${hostname} — default instance`
            : `${hostname} — ${instanceName}`,
        status: row.status === "running" ? "running" : "installed",
        ...(Number.isInteger(port) && port > 0 && port <= 65535 ? { port } : {}),
      };
    });
}

function discoverLocalSqlServers({
  run = execFile,
  hostname = os.hostname(),
  platform = process.platform,
} = {}) {
  if (platform !== "win32") {
    return Promise.resolve({
      ok: false,
      servers: [],
      error: "Server discovery is available only in the Windows desktop app.",
    });
  }
  return new Promise((resolve) => {
    run(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", DISCOVERY_SCRIPT],
      { windowsHide: true, timeout: 8_000, maxBuffer: 256 * 1024 },
      (error, stdout = "") => {
        if (error && !stdout) {
          resolve({
            ok: false,
            servers: [],
            error: "Windows could not inspect the installed SQL Server instances.",
          });
          return;
        }
        try {
          resolve({ ok: true, servers: parseDiscoveryOutput(stdout, hostname) });
        } catch {
          resolve({
            ok: false,
            servers: [],
            error: "Windows returned an unreadable SQL Server instance list.",
          });
        }
      },
    );
  });
}

module.exports = { DISCOVERY_SCRIPT, discoverLocalSqlServers, parseDiscoveryOutput };
