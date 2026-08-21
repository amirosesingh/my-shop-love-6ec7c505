/**
 * Bridge to the Windows desktop shell's local Microsoft SQL Server database.
 *
 * In the packaged Electron app the preload script exposes `window.pos`, and
 * every write becomes a parameterised T-SQL statement executed in the main
 * process. In a plain browser the bridge is absent and callers fall back to the
 * localStorage outbox, so the web build behaves exactly as before.
 */
import type { SyncOp } from "./sync-outbox";

export type LocalDbConfig = {
  server: string;
  database: string;
  /** "windows" uses integrated auth, "sql" uses the user/password pair */
  auth: "windows" | "sql";
  user: string;
  password: string;
  port: number;
  encrypt: boolean;
  /** Accept self-signed / internal certificates (default on). */
  trustServerCertificate?: boolean;
  /** SET ARITHABORT ON for the session (default on). */
  arithAbort?: boolean;
};

export const defaultLocalDbConfig: LocalDbConfig = {
  server: "localhost\\SQLEXPRESS",
  database: "POS_Branch_DB",
  auth: "windows",
  user: "",
  password: "",
  // 0 means automatic: default instances use 1433, named instances let the
  // SQL driver/Browser resolve their dynamic port.
  port: 0,
  encrypt: false,
  trustServerCertificate: true,
  arithAbort: true,
};

export type TableSyncStat = {
  table: string;
  pending: number;
  synced: number;
  errored: number;
};

export type SyncQueueRow = {
  table: string;
  id: string;
  status: string;
  error: string | null;
  updatedAt: string | null;
};

export type LocalDbTestResult = {
  ok: boolean;
  version?: string;
  serverName?: string;
  activeDb?: string;
  latencyMs?: number;
  error?: string;
  code?: string | null;
  originalMessage?: string | null;
  hint?: string | null;
};

/**
 * The one state every panel reads. Derived in a single place so a spinner can
 * never outlive the work it belongs to, and nothing reports "connected" before
 * the shell has proved the database answers.
 */
export type LocalWriteCheck = {
  ok: boolean;
  activeDb?: string | null;
  createdProbeTable?: boolean;
  rolledBack?: boolean;
  latencyMs?: number;
  error?: string;
  code?: string | null;
  hint?: string | null;
};

export type LocalDbConnectionState =
  | "unavailable"
  | "not_configured"
  | "testing"
  | "saving"
  | "initializing"
  | "connected"
  | "failed";

export type LocalDbConnectionView = {
  state: LocalDbConnectionState;
  /** One plain line an operator can act on. */
  message: string;
  detail?: string | null;
  busy: boolean;
};

const STATE_MESSAGE: Record<LocalDbConnectionState, string> = {
  unavailable: "Local database unavailable",
  not_configured: "Local database requires setup",
  testing: "Checking the local database…",
  saving: "Saving the connection…",
  initializing: "Reconnecting…",
  connected: "Local database connected",
  failed: "Local database unavailable",
};

export function describeLocalDbState(
  state: LocalDbConnectionState,
  detail?: string | null,
): LocalDbConnectionView {
  return {
    state,
    message: STATE_MESSAGE[state],
    detail: detail ?? null,
    busy: state === "testing" || state === "saving" || state === "initializing",
  };
}

/**
 * Turns the shell's raw status into the single state above.
 *
 * `pending` is whatever the UI is doing right now (a wizard run, a save); it
 * always wins, because that is the only work the spinner belongs to.
 */
export function deriveLocalDbState(input: {
  available: boolean;
  configured: boolean;
  status:
    | (Pick<LocalSyncStatus, "connected" | "error"> & {
        errorHint?: string | null;
        errorCode?: string | null;
      })
    | null;
  pending?: "testing" | "saving" | null;
}): LocalDbConnectionView {
  if (!input.available) return describeLocalDbState("unavailable");
  if (input.pending) return describeLocalDbState(input.pending);
  if (input.status?.connected) return describeLocalDbState("connected");
  if (input.status?.error) return describeLocalDbState("failed", reconnectReason(input.status));
  if (!input.configured) return describeLocalDbState("not_configured");
  return describeLocalDbState("initializing", "Trying to reach the saved database.");
}

/**
 * The banner shows the driver's actual reason, not a generic line: a stopped
 * SQL Browser or a wrong port is a fixable misconfiguration and the operator
 * should be told which one it is.
 */
export function reconnectReason(status: {
  error?: string | null;
  errorHint?: string | null;
}): string {
  const parts = [status.error?.trim(), status.errorHint?.trim()].filter(Boolean);
  return parts.length ? parts.join(" ") : "Trying to reach the saved database.";
}


/** No IPC call may hang the UI: everything gets an outer deadline. */
export async function withIpcTimeout<T>(
  work: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return (await Promise.race([
    work.finally(() => clearTimeout(timer)),
    new Promise<never>((_r, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ])) as T;
}

/**
 * Save the details and point the till at the database. Resolves as soon as the
 * shell has proved the local database is usable; cloud sync starts behind it.
 */
export async function connectLocalDatabase(
  config: LocalDbConfig,
  cloud?: CloudBridgeConfig,
): Promise<LocalDbTestResult> {
  const bridge = localDb();
  if (!bridge) return { ok: false, error: "Only the Windows desktop app has a local database." };
  try {
    await writeLocalDbConfig(config);
  } catch (err) {
    return {
      ok: false,
      error: `The connection details could not be saved: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
  try {
    return await withIpcTimeout(
      bridge.connect(config, cloud),
      60_000,
      "The desktop shell did not answer. The local database may be unreachable — check the server name and firewall.",
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** One SQL Server instance found on this machine or the local network. */
export type DiscoveredDbServer = {
  address: string;
  serverName: string;
  instance: string;
  port: number | null;
  version: string | null;
  source?: "browser" | "local" | "registry";
};

export type ScanNetworkResult = {
  ok: boolean;
  servers?: DiscoveredDbServer[];
  error?: string;
  hint?: string;
};

/** Result of the local (registry + loopback) instance scan. */
export type LocalInstanceScan = ScanNetworkResult & {
  hostname?: string;
  targets?: string[];
};

/** Parameters accepted by the direct (Browser-free) connection probe. */
export type DirectConnectionParams = {
  host: string;
  port: number;
  database: string;
  authType: "windows" | "sql";
  username?: string;
  password?: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
  arithAbort: boolean;
  timeout?: number;
};

export type LocalSyncStatus = {
  connected: boolean;
  error?: string;
  phase?: "idle" | "pushing" | "pulling";
  enabled?: boolean;
  tables: TableSyncStat[];
  queue?: SyncQueueRow[];
  lastPushAt: string | null;
  lastPullAt: string | null;
  server?: string | null;
  database?: string | null;
};

export type PosBridge = {
  /** Persist one operation to local SQL Server. Resolves once committed. */
  write: (context: string, op: SyncOp) => Promise<{ ok: boolean; error?: string }>;
  connect: (
    config: LocalDbConfig,
    cloud?: CloudBridgeConfig,
  ) => Promise<LocalDbTestResult & { cloudError?: string }>;
  configureCloud: (cloud: CloudBridgeConfig) => Promise<{ ok: boolean; error?: string }>;
  test: (config: LocalDbConfig) => Promise<LocalDbTestResult>;
  getDatabaseConfig?: () => Promise<Partial<LocalDbConfig> | null>;
  /** Forget the saved connection and drop every pool (escape hatch). */
  resetConnection?: () => Promise<{ ok: boolean; error?: string | null }>;
  /** Forget the saved connection (same as resetConnection, explicit name). */
  forgetConnection?: () => Promise<{ ok: boolean; error?: string | null }>;
  /** Rebuild the connection from the SAVED credentials — no restart, no setup. */
  reconnect?: () => Promise<LocalDbReconnectResult>;
  /** Ask the background loop for an immediate attempt. */
  retryConnection?: () => Promise<{ ok: boolean }>;
  /** Read the single master schema file — passive, never executes anything. */
  readSchema?: () => Promise<{
    ok: boolean;
    file?: string;
    text?: string;
    tables?: string[];
    error?: string;
  }>;
  /** Apply database/schema.sql. Only ever called from an explicit user click. */
  applySchema?: () => Promise<{ ok: boolean; file?: string; error?: string }>;
  /** Discover local/LAN SQL Server instances (desktop shell only). */
  scanNetwork?: () => Promise<ScanNetworkResult>;
  scanLocalDatabases?: () => Promise<ScanNetworkResult>;
  /** Registry + loopback discovery of instances installed on this PC. */
  scanLocalInstances?: () => Promise<LocalInstanceScan>;
  status: () => Promise<LocalSyncStatus>;
  /** Transactional write probe on the operational pool (always rolled back). */
  verifyWrite?: () => Promise<LocalWriteCheck>;
  push: () => Promise<{ ok: boolean; pushed: number; failed: number; error?: string }>;
  pull: () => Promise<{ ok: boolean; merged: number; error?: string }>;
  setSyncEnabled: (on: boolean) => Promise<void>;
  backup: (path?: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  retryErrored: () => Promise<{ ok: boolean }>;
  retryRow?: (table: string, id: string) => Promise<{ ok: boolean; error?: string }>;
  /** Stop retrying a change that can never succeed (desktop shell only). */
  discardRow?: (table: string, id: string) => Promise<{ ok: boolean; error?: string }>;
  /** Prunes rows the central database has confirmed plus orphaned temp files. */
  housekeep?: (options?: { retentionDays?: number }) => Promise<{
    ok: boolean;
    error?: string;
    files?: number;
    bytes?: number;
    rows?: number;
  }>;
  snapshot: () => Promise<{
    ok: boolean;
    error?: string;
    products?: LocalSaleRow[];
    members?: LocalSaleRow[];
    stores?: LocalSaleRow[];
    shifts?: LocalSaleRow[];
    promotions?: LocalSaleRow[];
    tiers?: LocalSaleRow[];
    settings?: LocalSaleRow | null;
  }>;
  /** Device settings stored in the branch SQL database. */
  getSetting?: (key: string) => Promise<{ ok: boolean; value?: string | null; error?: string }>;
  setSetting?: (key: string, value: string | null) => Promise<{ ok: boolean; error?: string }>;
  onStatus: (cb: (s: LocalSyncStatus) => void) => () => void;
};

export type CloudBridgeConfig = {
  url: string;
  key: string;
  accessToken?: string;
  sessionToken?: string;
  cashierToken?: string;
  terminalToken?: string;
  branchId?: string;
};

declare global {
  interface Window {
    pos?: PosBridge;
    electronAPI?: ElectronDbApi;
  }
}

/* ------------------------- offline register API ------------------------- */

export type LocalSaleRow = Record<string, unknown>;

export type CreateSalePayload = {
  sale: LocalSaleRow;
  items: LocalSaleRow[];
  products?: LocalSaleRow[];
  member?: LocalSaleRow | null;
  branchId?: string | null;
  exchangeOfBillNumber?: string | null;
};

export type BranchInfo = { branchId: string | null; branchName: string | null };

export type ElectronDbApi = {
  /** Commits a bill to local SQL Server in one transaction. Never uses HTTP. */
  createSale: (
    payload: CreateSalePayload,
  ) => Promise<{ ok: boolean; error?: string; id?: string; billNumber?: string }>;
  getProducts: () => Promise<{ ok: boolean; error?: string; products?: LocalSaleRow[] }>;
  getPendingSyncCount: () => Promise<{
    ok: boolean;
    total: number;
    sales: number;
    error?: string;
  }>;
  getBranch: () => Promise<{ ok: boolean } & Partial<BranchInfo>>;
  setBranch: (branch: BranchInfo) => Promise<{ ok: boolean; error?: string }>;
};

/** The offline database API, or null in a plain browser. */
export const electronDb = (): ElectronDbApi | null =>
  typeof window === "undefined" ? null : (window.electronAPI ?? null);

const BRANCH_KEY = "pos.branch";

export const defaultBranch: BranchInfo = { branchId: null, branchName: null };

/** Branch identity for this till, mirrored locally so the UI can render it. */
export function readBranch(): BranchInfo {
  if (typeof window === "undefined") return defaultBranch;
  try {
    const raw = window.localStorage.getItem(BRANCH_KEY);
    return raw ? { ...defaultBranch, ...(JSON.parse(raw) as Partial<BranchInfo>) } : defaultBranch;
  } catch {
    return defaultBranch;
  }
}

export function writeBranch(branch: BranchInfo) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BRANCH_KEY, JSON.stringify(branch));
  void electronDb()?.setBranch(branch);
}

/** True when running inside the Windows desktop shell. */
export const hasLocalDb = (): boolean => typeof window !== "undefined" && !!window.pos;

/** True when a real local SQL engine is reachable through the desktop shell. */
export const hasLocalSqlEngine = (): boolean =>
  typeof window !== "undefined" && typeof window.pos?.setSetting === "function";

/** Read a device setting from the branch SQL database, if there is one. */
export async function readLocalSetting(key: string): Promise<string | null> {
  const bridge = localDb();
  if (!bridge?.getSetting) return null;
  try {
    const res = await bridge.getSetting(key);
    return res.ok ? (res.value ?? null) : null;
  } catch {
    return null;
  }
}

/** Store a device setting in the branch SQL database when one is present. */
export async function writeLocalSetting(key: string, value: string | null): Promise<boolean> {
  const bridge = localDb();
  if (!bridge?.setSetting) return false;
  try {
    return (await bridge.setSetting(key, value)).ok;
  } catch {
    return false;
  }
}

export const localDb = (): PosBridge | null =>
  typeof window === "undefined" ? null : (window.pos ?? null);

/**
 * Ask the desktop shell to look for SQL Server instances. In the browser there
 * is no network access to give, so the caller gets an empty, explained result.
 */
export async function scanLocalDatabases(): Promise<ScanNetworkResult> {
  const bridge = localDb();
  const run = bridge?.scanNetwork ?? bridge?.scanLocalDatabases;
  if (!run) {
    return {
      ok: false,
      servers: [],
      error: "Network discovery is only available in the Windows desktop app.",
    };
  }
  try {
    const res = await run();
    return { ...res, servers: res.servers ?? [] };
  } catch (err) {
    return { ok: false, servers: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Registry + loopback discovery of SQL Server instances installed on this PC.
 * Falls back to the LAN scan when the shell predates the dedicated channel.
 */
export async function scanLocalInstances(): Promise<LocalInstanceScan> {
  const bridge = localDb();
  if (!bridge) {
    return {
      ok: false,
      servers: [],
      targets: [],
      error: "Instance discovery is only available in the Windows desktop app.",
    };
  }
  try {
    if (bridge.scanLocalInstances) {
      const res = await bridge.scanLocalInstances();
      return { ...res, servers: res.servers ?? [], targets: res.targets ?? [] };
    }
    const res = await scanLocalDatabases();
    return {
      ...res,
      targets: (res.servers ?? []).map((s) =>
        s.instance ? `${s.serverName}\\${s.instance}` : s.serverName,
      ),
    };
  } catch (err) {
    return {
      ok: false,
      servers: [],
      targets: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Proves the till's own pool can write: one transaction that inserts, reads
 * back, then rolls back. Nothing customer-facing is touched.
 */
export async function verifyLocalWrite(timeoutMs = 30_000): Promise<LocalWriteCheck> {
  const bridge = localDb();
  if (!bridge?.verifyWrite) {
    return { ok: false, error: "Only the Windows desktop app can write to a local database." };
  }
  try {
    return await withIpcTimeout(
      bridge.verifyWrite(),
      timeoutMs,
      "The write check did not finish. The database accepted the sign-in but never answered the write.",
    );
  } catch (err) {
    return { ok: false, code: "ETIMEOUT", error: err instanceof Error ? err.message : String(err) };
  }
}

/** Single connection probe with explicit TLS options; reports latency. */
export async function testDirectConnection(
  params: DirectConnectionParams,
): Promise<LocalDbTestResult> {
  const bridge = localDb();
  if (!bridge) {
    return { ok: false, error: "Only the Windows desktop app can reach a local SQL Server." };
  }
  try {
    return await bridge.test({
      server: params.host,
      database: params.database,
      auth: params.authType,
      user: params.username ?? "",
      password: params.password ?? "",
      port: params.port,
      encrypt: params.encrypt,
      trustServerCertificate: params.trustServerCertificate,
      arithAbort: params.arithAbort,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

let cachedConfig: LocalDbConfig | null = null;

export function readLocalDbConfig(): LocalDbConfig {
  return cachedConfig ?? defaultLocalDbConfig;
}

/**
 * Load the canonical connection details from Electron's OS-encrypted store.
 * Browser storage is deliberately not a connection authority.
 */
export async function loadLocalDbConfig(): Promise<LocalDbConfig> {
  if (typeof window === "undefined") return defaultLocalDbConfig;
  const sealed = await localDb()?.getDatabaseConfig?.();
  if (sealed) {
    cachedConfig = { ...defaultLocalDbConfig, ...sealed };
    return cachedConfig;
  }
  cachedConfig = defaultLocalDbConfig;
  return cachedConfig;
}

/**
 * Keep current wizard values in memory. The main process persists them only
 * after the operational connection has been verified.
 */
export async function writeLocalDbConfig(config: LocalDbConfig) {
  if (typeof window === "undefined") return;
  cachedConfig = config;
}

/**
 * Escape hatch for a stuck or unwanted connection: cancels anything in flight,
 * closes both pools and forgets the sealed credentials. Safe to call at any
 * time, including while the wizard is mid-run.
 */
export type LocalDbReconnectResult = {
  ok: boolean;
  stage?: string;
  activeDb?: string | null;
  serverName?: string | null;
  latencyMs?: number | null;
  error?: string | null;
  hint?: string | null;
};

/**
 * Rebuild the connection from the credentials already saved on this till.
 *
 * This is the fix for "Reconnecting…" that never recovered: it tears both
 * pools down, cancels anything wedged and opens the saved connection again,
 * without asking the operator to restart or to type the server details afresh.
 */
export async function reconnectLocalDatabase(): Promise<LocalDbReconnectResult> {
  const bridge = localDb();
  if (!bridge?.reconnect) {
    return { ok: false, error: "Only the Windows desktop app holds a local database connection." };
  }
  try {
    return await withIpcTimeout(
      bridge.reconnect(),
      70_000,
      "The reconnect did not finish in time.",
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Nudge the background retry loop to attempt right now. */
export async function retryLocalDatabaseNow(): Promise<{ ok: boolean }> {
  const bridge = localDb();
  if (!bridge?.retryConnection) return { ok: false };
  try {
    return await withIpcTimeout(bridge.retryConnection(), 10_000, "The retry request timed out.");
  } catch {
    return { ok: false };
  }
}

export async function resetLocalDatabase(): Promise<{ ok: boolean; error?: string | null }> {
  const bridge = localDb();
  const forget = bridge?.forgetConnection ?? bridge?.resetConnection;
  if (!forget) {
    return { ok: false, error: "Only the Windows desktop app holds a local database connection." };
  }
  try {
    const res = await withIpcTimeout(
      forget(),
      15_000,
      "The reset did not finish in time. Restart the till if the connection stays stuck.",
    );
    cachedConfig = defaultLocalDbConfig;
    return res;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
