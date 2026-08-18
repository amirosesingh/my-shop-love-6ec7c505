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

function toDriverConfig(config) {
  loadDriver();
  const { host, instanceName, port, explicitPort } = parseServerField(
    config.server,
    config.port,
  );
  const local = isLocalHost(host) || isPrivateLan(host);
  const base = {
    server: host,
    database: config.database,
    connectionTimeout: CONNECT_TIMEOUT_MS,
    requestTimeout: CONNECT_TIMEOUT_MS,
    options: {
      // Local instances usually have no certificate; forcing encryption there
      // is what produces the "self signed certificate" handshake failures.
      encrypt: config.encrypt === undefined ? !local : !!config.encrypt,
      trustServerCertificate:
        config.trustServerCertificate === undefined ? true : !!config.trustServerCertificate,
      enableArithAbort: config.arithAbort === undefined ? true : !!config.arithAbort,
      connectTimeout: CONNECT_TIMEOUT_MS,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  };
  if (Number(config.timeout) > 0) {
    base.connectionTimeout = Number(config.timeout);
    base.requestTimeout = Number(config.timeout);
    base.options.connectTimeout = Number(config.timeout);
  }
  if (instanceName) {
    // With a named instance SQL Browser (UDP 1434) resolves the dynamic port,
    // so a fixed port must only be sent when the operator typed one.
    base.options.instanceName = instanceName;
    if (explicitPort) base.port = port;
  } else {
    base.port = port;
  }
  if (config.auth === "windows") {
    if (requireWindowsDriver()) {
      // Native driver: integrated auth straight through ODBC.
      base.driver = "msnodesqlv8";
      base.options.trustedConnection = true;
      base.connectionString = [
        "Driver={ODBC Driver 17 for SQL Server}",
        `Server=${instanceName ? `${host}\\${instanceName}` : `${host},${port}`}`,
        `Database=${config.database}`,
        "Trusted_Connection=yes",
        `TrustServerCertificate=${base.options.trustServerCertificate ? "yes" : "no"}`,
      ].join(";");
    } else if (config.user) {
      // Fallback: tedious can do NTLM when a domain account is supplied.
      delete base.user;
      delete base.password;
      base.authentication = {
        type: "ntlm",
        options: {
          userName: config.user,
          password: config.password,
          domain: config.domain || process.env["USERDOMAIN"] || host,
        },
      };
    } else {
      const e = new Error(WINDOWS_AUTH_HINT);
      e.code = "EDRIVER";
      throw e;
    }
  } else {
    base.user = config.user;
    base.password = config.password;
  }
  return base;
}

async function connect(config) {
  await close();
  const driverConfig = toDriverConfig(config);
  pool = await new (loadDriver().ConnectionPool)(driverConfig).connect();
  activeConfig = config;
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