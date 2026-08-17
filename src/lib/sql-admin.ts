/**
 * Typed renderer bridge to the desktop shell's SSMS-style administration
 * connection. In a browser the bridge is absent and every call resolves to a
 * friendly "desktop only" result, so no page can crash on the web build.
 */
export type SqlAdminCredentials = {
  server: string;
  database?: string;
  port?: number;
  auth: "windows" | "sql";
  user?: string;
  password?: string;
  domain?: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
};

export type SqlAdminFailure = {
  ok: false;
  error?: string;
  code?: string | null;
  originalMessage?: string | null;
  hint?: string | null;
};

export type SqlDatabase = { name: string; state: string };
export type SqlTable = { schema: string; name: string; type: "table" | "view" };
export type SqlColumn = {
  name: string;
  type: string;
  length: number | null;
  nullable: boolean;
  defaultValue: string | null;
};

export type SqlAdminConnectResult =
  | {
      ok: true;
      serverName: string | null;
      version: string | null;
      activeDb: string;
      usedTrustFallback: boolean;
      databases: SqlDatabase[];
    }
  | SqlAdminFailure;

export type SqlAdminStatus = {
  connected: boolean;
  server: string | null;
  serverName: string | null;
  database: string | null;
  auth: "windows" | "sql" | null;
  usedTrustFallback: boolean;
};

export type SqlQueryResult =
  | {
      ok: true;
      columns: string[];
      rows: Record<string, unknown>[];
      rowCount: number;
      truncated: boolean;
      elapsedMs: number;
    }
  | (SqlAdminFailure & { elapsedMs?: number });

export type SqlPortProbe =
  | { ok: true; host: string; port: number; elapsedMs: number }
  | (SqlAdminFailure & { host?: string; port?: number; elapsedMs?: number });

export type SqlLockResult =
  | { ok: true; activeDb: string; usedTrustFallback: boolean }
  | SqlAdminFailure;

export type SqlAdminBridge = {
  connectInstance: (credentials: SqlAdminCredentials) => Promise<SqlAdminConnectResult>;
  /** Raw 2-second TCP reachability probe — names firewall/port problems. */
  probePort?: (credentials: SqlAdminCredentials) => Promise<SqlPortProbe>;
  /** Re-point the administration pool at the operator's chosen database. */
  lockDatabase?: (credentials: SqlAdminCredentials) => Promise<SqlLockResult>;
  listDatabases: () => Promise<{ ok: true; databases: SqlDatabase[] } | SqlAdminFailure>;
  getTables: (
    dbName: string,
  ) => Promise<{ ok: true; tables: SqlTable[] } | (SqlAdminFailure & { tables: SqlTable[] })>;
  getTableColumns: (
    dbName: string,
    tableName: string,
    schemaName?: string,
  ) => Promise<{ ok: true; columns: SqlColumn[] } | (SqlAdminFailure & { columns: SqlColumn[] })>;
  executeQuery: (dbName: string, queryText: string) => Promise<SqlQueryResult>;
  disconnect: () => Promise<{ ok: boolean }>;
  status: () => Promise<SqlAdminStatus>;
};

declare global {
  interface Window {
    sqlAdmin?: SqlAdminBridge;
  }
}

export const sqlAdmin = (): SqlAdminBridge | null =>
  typeof window === "undefined" ? null : (window.sqlAdmin ?? null);

export const hasSqlAdmin = (): boolean => !!sqlAdmin();

export const DESKTOP_ONLY: SqlAdminFailure = {
  ok: false,
  error: "A local SQL Server can only be reached from the Windows desktop app.",
  code: "EWEB",
  hint: null,
};

/** Same read-only gate the main process enforces, so mistakes are caught early. */
const FORBIDDEN =
  /\b(insert|update|delete|merge|drop|create|alter|truncate|grant|revoke|deny|backup|restore|exec|execute|sp_\w*|xp_\w*|shutdown|reconfigure|openrowset|opendatasource|bulk|waitfor|into)\b/i;

export function checkReadOnly(text: string): string | null {
  // Strip literals and comments first, so a commented-out prefix cannot hide a
  // second statement from the structural checks.
  const stripped = text
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .trim()
    .replace(/;+\s*$/, "");
  if (!stripped) return "Enter a query to run.";
  if (stripped.includes(";")) return "Run one statement at a time — remove the extra ';'.";
  if (!/^(select|with)\b/i.test(stripped)) return "Only SELECT statements can be run here.";
  if (FORBIDDEN.test(stripped))
    return "This editor is read-only — statements that change data or schema are blocked.";
  return null;
}
