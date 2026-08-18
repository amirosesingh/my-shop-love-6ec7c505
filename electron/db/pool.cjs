/**
 * Connection pool for the local Microsoft SQL Server instance.
 *
 * The renderer never talks to SQL Server; only this module (main process) does.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const DRIVER_HINT =
  "Local database driver not installed. Run: npm install mssql";
const WINDOWS_AUTH_HINT =
  "Windows authentication needs the msnodesqlv8 driver. Run: npm install msnodesqlv8 (requires Visual Studio Build Tools), or switch to a SQL Server login.";

const CONNECT_TIMEOUT_MS = 15_000;

let driver = null;
let nativeDriver = null;

/** Loads the mssql driver on first use so a missing module never kills boot. */
function loadDriver() {
  if (driver) return driver;
  try {
    driver = require("mssql");
  } catch (err) {
    const e = new Error(DRIVER_HINT);
    e.cause = err;
    throw e;
  }
  return driver;
}

/**
 * Windows integrated auth needs the NATIVE build of mssql. Setting
 * `config.driver = "msnodesqlv8"` on the default (tedious) build is silently
 * ignored, which is what produced sign-in failures with no user/password.
 */
function loadNativeDriver() {
  if (nativeDriver) return nativeDriver;
  try {
    nativeDriver = require("mssql/msnodesqlv8");
  } catch (err) {
    const e = new Error(WINDOWS_AUTH_HINT);
    e.code = "EDRIVER";
    e.cause = err;
    throw e;
  }
  return nativeDriver;
}

const KNOWN_ODBC_DRIVERS = [
  "ODBC Driver 18 for SQL Server",
  "ODBC Driver 17 for SQL Server",
  "ODBC Driver 13 for SQL Server",
  "SQL Server Native Client 11.0",
  "SQL Server",
];

let odbcCache = null;

/** ODBC drivers actually installed on this PC, best first. */
function installedOdbcDrivers() {
  if (odbcCache) return odbcCache;
  let found = [];
  if (process.platform === "win32") {
    try {
      const out = execFileSync(
        "reg",
        ["query", "HKLM\\SOFTWARE\\ODBC\\ODBCINST.INI\\ODBC Drivers"],
        { timeout: 4000, windowsHide: true, encoding: "utf8" },
      ).toLowerCase();
      found = KNOWN_ODBC_DRIVERS.filter((name) => out.includes(name.toLowerCase()));
    } catch {
      found = [];
    }
  }
  odbcCache = found.length ? found : KNOWN_ODBC_DRIVERS;
  return odbcCache;
}

function requireWindowsDriver() {
  try {
    require.resolve("msnodesqlv8");
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * `localhost\SQLEXPRESS`, `HOST\INST,1435`, `tcp:host,1433` and plain hosts all
 * arrive in the same field. Tedious needs them split apart.
 */
function parseServerField(raw, fallbackPort) {
  let text = String(raw ?? "").trim();
  text = text.replace(/^tcp:/i, "");
  let port = Number(fallbackPort) || 1433;
  let explicitPort = false;
  const comma = text.lastIndexOf(",");
  if (comma > -1) {
    const maybePort = Number(text.slice(comma + 1).trim());
    if (Number.isFinite(maybePort) && maybePort > 0) {
      port = maybePort;
      explicitPort = true;
      text = text.slice(0, comma).trim();
    }
  }
  let instanceName = "";
  const slash = text.indexOf("\\");
  if (slash > -1) {
    instanceName = text.slice(slash + 1).trim();
    text = text.slice(0, slash).trim();
  }
  return { host: text || "localhost", instanceName, port, explicitPort };
}

const isLocalHost = (host) =>
  /^(localhost|127\.0\.0\.1|\.|\(local\))$/i.test(String(host || "")) ||
  String(host || "").toLowerCase() === String(process.env["COMPUTERNAME"] || "").toLowerCase();

/**
 * Private-LAN servers (the shop's back-office PC) almost never have a trusted
 * certificate either, so they get the same relaxed TLS defaults as localhost.
 */
const isPrivateLan = (host) => {
  const text = String(host || "").trim();
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (!m) return !text.includes("."); // bare NetBIOS name => same LAN
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
};

/** Turns a driver failure into something a cashier or admin can act on. */
function describeSqlError(err) {
  const code = err?.code || err?.originalError?.code || null;
  const message = err instanceof Error ? err.message : String(err);
  const originalMessage =
    err?.originalError?.message || err?.originalError?.info?.message || null;
  const hints = {
    ELOGIN: "The server was reached but rejected the sign-in. Check the user name, password, or that the Windows account has access to this database.",
    ESOCKET: "Could not open a socket to SQL Server. Check the service is running, TCP/IP is enabled in SQL Server Configuration Manager, and the port is open.",
    ETIMEOUT: "The server did not answer in time. A firewall, a wrong port, or a stopped SQL Server Browser service are the usual causes.",
    ETIMEDOUT: "The server did not answer in time. Check the firewall on the database machine and that TCP/IP is enabled in SQL Server Configuration Manager.",
    ETIMEOUT_INSTANCE_LOOKUP: "The named instance could not be resolved. Start the SQL Server Browser service or enter the instance's fixed TCP port.",
    EINSTLOOKUP: "The named instance could not be found. Check the instance name and that SQL Server Browser (UDP 1434) is running.",
    ECONNREFUSED: "The machine answered but nothing is listening on that port.",
    ENOTFOUND: "The server name could not be resolved on the network.",
    EDRIVER: "The database driver is missing on this machine.",
  };
  return {
    error: message,
    code,
    originalMessage,
    hint: (code && hints[code]) || null,
  };
}

/**
 * Lazy stand-in for the mssql namespace: `sql.Int`, `new sql.Transaction(...)`
 * etc. keep working, but the module is only required when actually touched.
 */
const sql = new Proxy(
  {},
  {
    get: (_t, prop) => Reflect.get(loadDriver(), prop),
    has: (_t, prop) => Reflect.has(loadDriver(), prop),
  },
);

let pool = null;
let activeConfig = null;

/**
 * Works out where the instance actually listens.
 *
 * A named instance normally needs SQL Browser (UDP 1434). When Browser is
 * stopped the driver's own lookup times out, so the port is asked for once
 * here and, if known, the connection is made straight to `host,port` — which
 * is exactly what the wizard's TCP step already proved reachable.
 */
async function resolveTarget(config) {
  const parsed = parseServerField(config.server, config.port);
  let port = parsed.port;
  let portKnown = !parsed.instanceName || parsed.explicitPort;
  let browserAnswered = false;
  if (parsed.instanceName && !parsed.explicitPort) {
    let discovered = null;
    try {
      discovered = await require("./discover.cjs").instancePort(parsed.host, parsed.instanceName);
    } catch {
      discovered = null;
    }
    if (discovered) {
      port = discovered;
      portKnown = true;
      browserAnswered = true;
    }
  }
  return { ...parsed, port, portKnown, browserAnswered };
}

/** Encryption combinations tried in order until one completes the handshake. */
function securityLadder(config, host) {
  const local = isLocalHost(host) || isPrivateLan(host);
  const wanted = {
    encrypt: config.encrypt === undefined ? !local : !!config.encrypt,
    trust:
      config.trustServerCertificate === undefined ? true : !!config.trustServerCertificate,
  };
  const ladder = [wanted, { encrypt: true, trust: true }, { encrypt: false, trust: true }];
  const seen = new Set();
  return ladder.filter((s) => {
    const key = `${s.encrypt}|${s.trust}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function timeoutOf(config) {
  const value = Number(config.timeout);
  return value > 0 ? value : CONNECT_TIMEOUT_MS;
}

/** tedious config (SQL login, or NTLM when the native driver is missing). */
function tediousConfig(config, target, security, byPort) {
  const ms = timeoutOf(config);
  const base = {
    server: target.host,
    database: config.database,
    connectionTimeout: ms,
    requestTimeout: ms,
    options: {
      encrypt: security.encrypt,
      trustServerCertificate: security.trust,
      enableArithAbort: config.arithAbort === undefined ? true : !!config.arithAbort,
      connectTimeout: ms,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  };
  if (byPort) base.port = target.port;
  else base.options.instanceName = target.instanceName;
  if (config.auth === "windows") {
    base.authentication = {
      type: "ntlm",
      options: {
        userName: config.user,
        password: config.password,
        domain: config.domain || process.env["USERDOMAIN"] || target.host,
      },
    };
  } else {
    base.user = config.user;
    base.password = config.password;
  }
  return base;
}

/** msnodesqlv8 config — a pure connection string, no tedious-shaped fields. */
function nativeConfig(config, target, security, byPort, odbcDriver) {
  const ms = timeoutOf(config);
  const server = byPort
    ? `${target.host},${target.port}`
    : `${target.host}\\${target.instanceName}`;
  return {
    connectionString: [
      `Driver={${odbcDriver}}`,
      `Server=${server}`,
      `Database=${config.database || "master"}`,
      "Trusted_Connection=yes",
      `Encrypt=${security.encrypt ? "yes" : "no"}`,
      `TrustServerCertificate=${security.trust ? "yes" : "no"}`,
      `Connection Timeout=${Math.round(ms / 1000)}`,
    ].join(";"),
    connectionTimeout: ms,
    requestTimeout: ms,
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  };
}

const isLoginFailure = (err) =>
  err?.code === "ELOGIN" ||
  /login failed|password did not match|not associated with a trusted/i.test(
    `${err?.message ?? ""} ${err?.originalError?.message ?? ""}`,
  );

const isOdbcDriverMissing = (err) =>
  /IM002|data source name not found|driver.*not found|no default driver/i.test(
    `${err?.message ?? ""} ${err?.originalError?.message ?? ""}`,
  );

/**
 * Every combination worth trying, best first: known port before instance
 * lookup, the operator's encryption choice before the relaxed local defaults,
 * newest installed ODBC driver first for Windows auth.
 */
async function planAttempts(config) {
  const target = await resolveTarget(config);
  const security = securityLadder(config, target.host);
  const routes = [];
  if (target.portKnown) routes.push(true);
  if (target.instanceName) routes.push(false);
  if (!routes.length) routes.push(true);

  const native = config.auth === "windows" && requireWindowsDriver();
  const drivers = native ? installedOdbcDrivers() : [null];
  if (config.auth === "windows" && !native && !config.user) {
    const e = new Error(WINDOWS_AUTH_HINT);
    e.code = "EDRIVER";
    throw e;
  }

  const attempts = [];
  for (const odbcDriver of drivers) {
    for (const byPort of routes) {
      for (const sec of security) {
        attempts.push({
          target,
          byPort,
          security: sec,
          native,
          odbcDriver,
          driverConfig: native
            ? nativeConfig(config, target, sec, byPort, odbcDriver)
            : tediousConfig(config, target, sec, byPort),
          label: `${
            byPort
              ? `${target.host},${target.port}`
              : `${target.host}\\${target.instanceName}`
          } · ${config.auth === "windows" ? "Windows" : `SQL login ${config.user ?? ""}`} · ${
            native ? odbcDriver : "tedious"
          } · encrypt ${sec.encrypt ? "on" : "off"}${sec.trust ? " (trusted cert)" : ""}`,
        });
      }
    }
  }
  return { target, attempts, native };
}

/**
 * Opens a pool, walking the attempt ladder. The winning combination and every
 * failed attempt come back with the result so the UI can explain itself.
 */
async function openConnection(config) {
  const { attempts, target, native } = await planAttempts(config);
  const tried = [];
  let lastError = null;
  for (const attempt of attempts) {
    try {
      const mssql = native ? loadNativeDriver() : loadDriver();
      const opened = await new mssql.ConnectionPool(attempt.driverConfig).connect();
      return {
        pool: opened,
        attempt: {
          label: attempt.label,
          host: target.host,
          port: attempt.byPort ? target.port : null,
          instanceName: target.instanceName || null,
          usedPort: attempt.byPort,
          driver: native ? attempt.odbcDriver : "tedious",
          auth: config.auth === "windows" ? "windows" : "sql",
          encrypt: attempt.security.encrypt,
          trustServerCertificate: attempt.security.trust,
          browserAnswered: target.browserAnswered,
        },
        tried,
      };
    } catch (err) {
      lastError = err;
      tried.push({ label: attempt.label, code: err?.code ?? null, error: err?.message ?? String(err) });
      // A rejected sign-in is final: no other port, driver or TLS setting fixes it.
      if (isLoginFailure(err)) break;
      // Only walk to the next ODBC driver when this one is genuinely absent.
      if (native && !isOdbcDriverMissing(err) && attempt.odbcDriver !== attempts.at(-1)?.odbcDriver) {
        const sameDriverLeft = attempts.some(
          (a) => a.odbcDriver === attempt.odbcDriver && !tried.some((t) => t.label === a.label),
        );
        if (!sameDriverLeft) break;
      }
    }
  }
  const error = lastError ?? new Error("Could not reach SQL Server");
  error.attempts = tried;
  error.target = target;
  throw error;
}

async function connect(config) {
  await close();
  const opened = await openConnection(config);
  pool = opened.pool;
  activeConfig = { ...config, resolved: opened.attempt };
  // Passive startup: connecting NEVER creates or alters tables. The operator
  // applies database/schema.sql explicitly from Local Database settings.
  return pool;
}

async function close() {
  if (pool) {
    try {
      await pool.close();
    } catch {
      /* pool already gone */
    }
    pool = null;
  }
}

function getPool() {
  if (!pool) throw new Error("Local database is not connected");
  return pool;
}

function getConfig() {
  return activeConfig;
}

/** Absolute path of the single master schema file, packaged or in-repo. */
function schemaFile() {
  const candidates = [
    path.join(__dirname, "..", "..", "database", "schema.sql"),
    path.join(process.resourcesPath ?? "", "database", "schema.sql"),
    path.join(process.cwd(), "database", "schema.sql"),
  ];
  return candidates.find((p) => p && fs.existsSync(p)) ?? candidates[0];
}

/**
 * Runs database/schema.sql batch-by-batch (mssql cannot execute GO separators).
 * Only ever called from an explicit operator action in the UI.
 */
async function applySchema() {
  const file = schemaFile();
  const text = fs.readFileSync(file, "utf8");
  const batches = text
    .split(/^\s*GO\s*$/gim)
    .map((b) => b.trim())
    .filter(Boolean);
  for (const batch of batches) {
    await pool.request().batch(batch);
  }
}

async function test(config) {
  let probe = null;
  const started = Date.now();
  try {
    const driverConfig = toDriverConfig(config);
    probe = await new (loadDriver().ConnectionPool)(driverConfig).connect();
    const res = await probe
      .request()
      .query("SELECT @@VERSION AS version, @@SERVERNAME AS name, DB_NAME() AS activeDb");
    const row = res.recordset[0] ?? {};
    return {
      ok: true,
      version: row.version,
      serverName: row.name,
      activeDb: row.activeDb,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - started, ...describeSqlError(err) };
  } finally {
    if (probe) await probe.close().catch(() => {});
  }
}

/** Reads the master schema file so the UI can show it before anything runs. */
function readSchema() {
  try {
    const file = schemaFile();
    const text = fs.readFileSync(file, "utf8");
    const tables = [...text.matchAll(/CREATE TABLE dbo\.(\w+)/gi)].map((m) => m[1]);
    return { ok: true, file, text, tables };
  } catch (err) {
    return { ok: false, error: err?.message ?? "Schema file could not be read" };
  }
}

/**
 * Explicit, operator-initiated schema apply. Never called on boot.
 */
async function applySchemaNow() {
  if (!pool) return { ok: false, error: "Connect to the local database first." };
  try {
    await applySchema();
    try {
      require("./repo.cjs").forgetColumnCache();
    } catch {
      /* repo not loaded yet */
    }
    return { ok: true, file: schemaFile() };
  } catch (err) {
    return { ok: false, ...describeSqlError(err) };
  }
}

module.exports = {
  sql,
  connect,
  close,
  getPool,
  getConfig,
  test,
  applySchema,
  applySchemaNow,
  readSchema,
  schemaFile,
  describeSqlError,
  parseServerField,
};