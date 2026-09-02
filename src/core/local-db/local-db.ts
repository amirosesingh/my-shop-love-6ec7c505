/**
 * Bridge to the Windows desktop shell's local Microsoft SQL Server database.
 *
 * In the packaged Electron app the preload script exposes `window.pos`, and
 * every write becomes a parameterised T-SQL statement executed in the main
 * process. In a plain browser the bridge is absent and callers fall back to the
 * localStorage outbox, so the web build behaves exactly as before.
 */
import type { SyncOp } from "@/lib/sync-outbox";

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
  /**
   * Connect straight to `server,port` and never ask SQL Server Browser to
   * resolve a named instance. The reliable choice whenever the port is known.
   */
  directConnect?: boolean;
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
  directConnect: false,
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

/**
 * Migration guard for the saved connection plus isolated-driver health.
 *
 * A named instance without a pinned port cannot work once connections stop
 * asking the SQL Server Browser service for a dynamic port, so it is reported
 * up front instead of failing at the first sale.
 */
export type LocalConnectionAudit = {
  ok: boolean;
  configured: boolean;
  direct: boolean;
  needsPort: boolean;
  host: string | null;
  instanceName: string | null;
  port: number | null;
  target: string | null;
  issues: Array<{ code: string; severity: "error" | "warning"; message: string; hint?: string }>;
  driver?: {
    workers: number;
    maxWorkers: number;
    orphanedSessions: number;
    sessionWarning: boolean;
    crashTargets: Array<{ target: string; consecutive: number; blocked: boolean }>;
    crashBlocked: boolean;
  };
};

export type LocalDbConnectionState =
  | "unavailable"
  | "not_configured"
  | "testing"
  | "saving"
  | "initializing"
  | "connected"
  | "failed"
  | "driver_blocked";

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
  driver_blocked: "Local database driver stopped",
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
  // A repeated driver crash is deterministic: the banner says so and the till
  // stops pretending a retry is imminent.
  if (input.status?.errorCode === "EDRIVER_CRASH_LOOP") {
    return describeLocalDbState("driver_blocked", reconnectReason(input.status));
  }
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

/**
 * Reads the saved-connection audit. Never throws: diagnostics failing must not
 * take the settings screen down with them.
 */
export async function readConnectionAudit(): Promise<LocalConnectionAudit | null> {
  const bridge = localDb();
  if (!bridge?.getConnectionAudit) return null;
  try {
    return await withIpcTimeout(
      bridge.getConnectionAudit(),
      5_000,
      "The connection check did not answer.",
    );
  } catch {
    return null;
  }
}

/**
 * Writes one diagnostic report file and reveals it. Used when a shop needs to
 * send evidence of a crash to support without hunting through a log folder.
 */
export async function saveDiagnosticReport(): Promise<{ ok: boolean; file?: string }> {
  const bridge = localDb() as
    (PosBridge & { collectDiagnostics?: () => Promise<{ ok: boolean; file?: string }> }) | null;
  if (!bridge?.collectDiagnostics) return { ok: false };
  try {
    return await withIpcTimeout(bridge.collectDiagnostics(), 10_000, "The report timed out.");
  } catch {
    return { ok: false };
  }
}

/** No IPC call may hang the UI: everything gets an outer deadline. */
export async function withIpcTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
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

/** Progress of an operator-triggered trading-history restore. */
export type RestoreRun = {
  running: boolean;
  table: string | null;
  index: number;
  total: number;
  restored: number;
  skipped: number;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  tables?: Array<{ table: string; restored: number; skipped: number; error?: string | null }>;
};

/** The rebuild check: what the till holds against what head office holds. */
export type RestoreCheck = {
  ok: boolean;
  at: string;
  days: number;
  since: string;
  pending: number;
  verdict: "complete" | "short";
  short: string[];
  tables: Array<{
    table: string;
    local: number;
    central: number | null;
    behind: number;
    ahead: number;
    error?: string | null;
  }>;
  error?: string;
};

/** A real wipe-and-restore drill, with the safety copy put back on failure. */
export type RestoreDrill = {
  running: boolean;
  phase: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  days: number;
  verdict: "pass" | "fail" | null;
  rolledBack: boolean;
  error?: string | null;
  blockers?: string[];
  tables: Array<{
    table: string;
    before: number;
    after: number;
    missing: number;
    changed: boolean;
    pass: boolean;
  }>;
};

export type LocalSyncStatus = {

  connected: boolean;
  error?: string;
  /** Structured reason from the shell, so the banner can be specific. */
  errorCode?: string | null;
  errorHint?: string | null;
  errorStage?: string | null;
  reconnecting?: boolean;
  configured?: boolean;
  phase?: "idle" | "pushing" | "pulling";
  enabled?: boolean;
  /** The central project rejected this device's keys — sync is parked. */
  credentialsInvalid?: boolean;
  tables: TableSyncStat[];
  queue?: SyncQueueRow[];
  lastPushAt: string | null;
  lastPullAt: string | null;
  lastRestoreAt?: string | null;
  restore?: RestoreRun | null;
  drill?: RestoreDrill | null;

  server?: string | null;
  database?: string | null;
};

export type PosBridge = {
  /** Persist one operation to local SQL Server. Resolves once committed. */
  write: (context: string, op: SyncOp) => Promise<{ ok: boolean; error?: string }>;
  /** Persist a related operation set in one SQL transaction. */
  writeBatch?: (context: string, ops: SyncOp[]) => Promise<{ ok: boolean; error?: string }>;
  connect: (
    config: LocalDbConfig,
    cloud?: CloudBridgeConfig,
  ) => Promise<LocalDbTestResult & { cloudError?: string }>;
  configureCloud: (cloud: CloudBridgeConfig) => Promise<{ ok: boolean; error?: string }>;
  test: (config: LocalDbConfig) => Promise<LocalDbTestResult>;
  getDatabaseConfig?: () => Promise<Partial<LocalDbConfig> | null>;
  getConnectionAudit?: () => Promise<LocalConnectionAudit>;
  /** Writes one shareable diagnostic report and reveals it in the file manager. */
  collectDiagnostics?: () => Promise<{ ok: boolean; file?: string }>;
  openLogFolder?: () => Promise<unknown>;
  /** Forget the saved connection and drop every pool (escape hatch). */
  resetConnection?: () => Promise<{ ok: boolean; error?: string | null }>;
  /** Forget the saved connection (same as resetConnection, explicit name). */
  forgetConnection?: () => Promise<{ ok: boolean; error?: string | null }>;
  /** Delete the sealed credentials file and stop the background retry loop. */
  removeConnection?: () => Promise<{
    ok: boolean;
    removed?: boolean;
    error?: string | null;
  }>;
  /**
   * Rebuild the connection. With no argument the saved credentials are used;
   * pass the values on screen to retry those instead.
   */
  reconnect?: (override?: Partial<LocalDbConfig>) => Promise<LocalDbReconnectResult>;
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
  /**
   * Per-table schema manifest compared live against the connected database.
   * When not connected, tables still come back with exists/present = null.
   */
  schemaStatus?: () => Promise<{
    ok: boolean;
    connected?: boolean;
    file?: string;
    text?: string;
    tables?: Array<{
      name: string;
      exists: boolean | null;
      columns: Array<{ name: string; type: string; present: boolean | null }>;
      missingColumns: string[];
      extraColumns: string[];
      columnCount: number | null;
    }>;
    unknownTables?: string[];
    warnings?: string[];
    error?: string;
  }>;
  /** Deep read-only inventory: nullability, defaults, keys, indexes, triggers. */
  schemaInventory?: () => Promise<{
    ok: boolean;
    connected?: boolean;
    tables?: Record<
      string,
      {
        columns: Record<string, { type: string | null; nullable: boolean; default: string | null }>;
        primaryKey: string[];
        foreignKeys: string[];
        constraints: string[];
        indexes: string[];
        triggers: string[];
      }
    >;
    error?: string;
  }>;
  /** Repair only the selected tables. Guarded batches — never drops data. */
  applySchemaTables?: (tables: string[]) => Promise<{
    ok: boolean;
    applied?: string[];
    unknownTables?: string[];
    batchCount?: number;
    errors?: Array<{ scope: string; code?: string; error?: string; permission?: boolean }>;
    /** True when the login lacks CREATE/ALTER rights — offer admin repair. */
    permission?: boolean;
    error?: string;
  }>;
  /** Runnable SQL script for the chosen tables (empty array = full file). */
  schemaTableSql?: (tables: string[]) => Promise<{
    ok: boolean;
    file?: string;
    tables?: string[];
    text?: string;
    error?: string;
  }>;
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
  /** Operator-triggered restore of this branch's trading history. */
  restore?: (options?: { days?: number }) => Promise<RestoreRun & { ok: boolean; error?: string }>;
  restoreStatus?: () => Promise<RestoreRun | null>;
  /** Rebuild check — counts only, safe at any time. */
  restoreVerify?: (options?: { days?: number }) => Promise<RestoreCheck>;
  /** The drill: wipe this branch's history and restore it, copy kept. */
  restoreDrill?: (options?: { days?: number }) => Promise<
    RestoreDrill & { ok: boolean; error?: string; blockers?: string[] }
  >;
  restoreEvidence?: () => Promise<{
    check: RestoreCheck | null;
    drill: RestoreDrill | null;
    blockers: string[];
  }>;
  /** Which tables this till pushes, pulls and can restore. */
  syncContract?: () => Promise<{ push: string[]; pull: string[]; restore: string[] }>;

  setSyncEnabled: (on: boolean) => Promise<void>;
  /** Live per-table counts on this till, for the server/shop comparison. */
  compareSummary?: (options?: { since?: string | null; tables?: string[] }) => Promise<{
    ok: boolean;
    error?: string;
    tables?: Array<{
      table: string;
      count: number;
      maxUpdatedAt: string | null;
      pending?: number;
      errored?: number;
      missing?: boolean;
      error?: string | null;
    }>;
  }>;
  compareRows?: (
    table: string,
    options?: { since?: string | null; limit?: number },
  ) => Promise<{
    ok: boolean;
    error?: string;
    rows?: Array<{ id: string; updatedAt: string | null; status?: string | null }>;
  }>;
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

  /* ---- offline cashier sign-in, backed by the local SQL database ---- */
  staffRoster?: (storeId?: string | null) => Promise<{ ok: boolean; rows: LocalStaffRow[] }>;
  cacheStaffRoster?: (rows: Record<string, unknown>[]) => Promise<{ ok: boolean; written: number }>;
  verifyStaffPin?: (
    username: string,
    pin: string,
  ) => Promise<{
    ok: boolean;
    reason?: string;
    error?: string;
    staff?: {
      id: string;
      username: string;
      full_name: string;
      store_id: string | null;
      permissions: Record<string, boolean>;
      role_slug?: string;
    };
  }>;
  rememberStaffPin?: (username: string, pin: string) => Promise<{ ok: boolean }>;
  forgetStaffPin?: (username: string) => Promise<{ ok: boolean }>;

  /* ---- the bundled app server holds no privileged key: presence only ---- */
  serverKeyStatus?: () => Promise<{ ok: boolean; hasSigningKey: boolean }>;

  /* ---- address of the hosted backend this device talks to ---- */
  backendUrl?: () => Promise<{ ok: boolean; url?: string }>;
  setBackendUrl?: (
    value: string,
  ) => Promise<{ ok: boolean; url?: string; error?: string }>;

  /* ---- emergency access recovery PIN (secret stays in the main process) ---- */
  verifyEmergencyPin?: (pin: string) => Promise<{ ok: boolean }>;
  emergencyFingerprint?: () => Promise<{ ok: boolean; fingerprint?: string }>;

  /* ---- tenant cloud credentials sealed in the OS vault ---- */

  cloudKeyStatus?: () => Promise<{
    ok: boolean;
    configured: boolean;
    url: string;
    keyHint: string;
    encrypted: boolean;
  }>;
  /** Boot-time read of the sealed pair so the renderer can configure its client. */
  bootstrapCloudCredentials?: () => Promise<{ ok: boolean; url?: string; key?: string }>;
  setCloudCredentials?: (value: {
    url: string;
    key: string;
  }) => Promise<{ ok: boolean; error?: string; encrypted?: boolean }>;
  removeCloudCredentials?: () => Promise<{ ok: boolean; error?: string }>;
  /** Fired by the shell at launch when no cloud keys are configured yet. */
  onCloudSetupRequired?: (cb: (payload: { platform: string }) => void) => () => void;
};

/** A staff row mirrored into the till's local database. */
export type LocalStaffRow = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  roleSlug: string;
  storeId: string | null;
  isActive: boolean;
  pinLength: number;
  permissions: Record<string, boolean>;
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
export async function reconnectLocalDatabase(
  override?: Partial<LocalDbConfig>,
): Promise<LocalDbReconnectResult> {
  const bridge = localDb();
  if (!bridge?.reconnect) {
    return { ok: false, error: "Only the Windows desktop app holds a local database connection." };
  }
  try {
    return await withIpcTimeout(
      bridge.reconnect(override),
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

/**
 * Delete the stored credentials for good. The shell unlinks the sealed file,
 * cancels anything in flight and stops the background retry loop, so the till
 * lands back on a clean "requires setup" state.
 */
export async function removeStoredConnection(): Promise<{
  ok: boolean;
  removed?: boolean;
  error?: string | null;
}> {
  const bridge = localDb();
  const remove = bridge?.removeConnection ?? bridge?.forgetConnection ?? bridge?.resetConnection;
  if (!remove) {
    return { ok: false, error: "Only the Windows desktop app holds a local database connection." };
  }
  try {
    const res = await withIpcTimeout(
      remove(),
      15_000,
      "Removing the saved connection did not finish in time.",
    );
    cachedConfig = defaultLocalDbConfig;
    return res;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
