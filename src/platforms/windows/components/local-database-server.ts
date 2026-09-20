export type DiscoveredSqlServer = {
  host: string;
  label: string;
  status: "running" | "installed";
};

const HOST = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?|\[[0-9A-Fa-f:]+\])$/;

export function normalizeServerHost(value: string): string {
  return value.trim();
}

/** Matches the Electron IPC hostname rule before the operator advances. */
export function validateServerEndpoint(host: string, port: number): string | null {
  const normalized = normalizeServerHost(host);
  if (!normalized) return "Enter a SQL Server hostname, localhost value, or IP address.";
  if (normalized.includes("\\"))
    return "Named instances are not supported. Enter the server hostname and TCP port separately.";
  if (!HOST.test(normalized)) return "Enter a valid hostname, localhost value, or IP address.";
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    return "Enter a TCP port between 1 and 65535.";
  return null;
}

export function selectDiscoveredServer<T extends { host: string }>(profile: T, server: DiscoveredSqlServer): T {
  return { ...profile, host: normalizeServerHost(server.host) };
}
