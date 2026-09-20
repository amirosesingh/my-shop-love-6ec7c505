export type DiscoveredSqlServer = {
  host: string;
  serverName?: string;
  instanceName?: string;
  serviceName?: string;
  port?: number;
  label: string;
  status: "running" | "installed";
};

const HOST = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?|\[[0-9A-Fa-f:]+\])$/;
const INSTANCE = /^[A-Za-z0-9_$-]{1,128}$/;

export function normalizeServerHost(value: string): string {
  return value.trim();
}

/** Matches the Electron IPC hostname rule before the operator advances. */
export function parseServerAddress(value: string): { host: string; instanceName: string } {
  const [host, ...instance] = normalizeServerHost(value).split("\\");
  return { host, instanceName: instance.join("\\") };
}

export function validateServerEndpoint(
  host: string,
  port: number,
  instanceName = "",
): string | null {
  const parsed = parseServerAddress(host);
  const normalized = parsed.host;
  const instance = instanceName.trim() || parsed.instanceName;
  if (!normalized) return "Enter a SQL Server hostname, localhost value, or IP address.";
  if (!HOST.test(normalized)) return "Enter a valid hostname, localhost value, or IP address.";
  if (instance && !INSTANCE.test(instance)) return "Enter a valid SQL Server instance name.";
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    return "Enter a TCP port between 1 and 65535, or use 0 with a named instance.";
  if (port === 0 && !instance) return "Enter a TCP port, or enter a named SQL Server instance.";
  return null;
}

export function selectDiscoveredServer<
  T extends { host: string; port?: number; instanceName?: string },
>(profile: T, server: DiscoveredSqlServer): T {
  return {
    ...profile,
    host: normalizeServerHost(server.host),
    instanceName: server.instanceName === "MSSQLSERVER" ? "" : (server.instanceName ?? ""),
    ...(server.port ? { port: server.port } : {}),
  };
}
