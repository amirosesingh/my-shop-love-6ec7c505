/**
 * Connection pool for the local Microsoft SQL Server instance.
 *
 * The renderer never talks to SQL Server; only this module (main process) does.
 */
const fs = require("node:fs");
const path = require("node:path");

const DRIVER_HINT =
  "Local database driver not installed. Run: npm install mssql";
const WINDOWS_AUTH_HINT =
  "Windows authentication needs the msnodesqlv8 driver. Run: npm install msnodesqlv8 (requires Visual Studio Build Tools), or switch to a SQL Server login.";

const CONNECT_TIMEOUT_MS = 15_000;

let driver = null;

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
      trustServerCertificate: true,
      enableArithAbort: true,
      connectTimeout: CONNECT_TIMEOUT_MS,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  };
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
        "TrustServerCertificate=yes",
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
  await applySchema();
  // Newly added columns must become visible to the write layer.
  try {
    require("./repo.cjs").forgetColumnCache();
  } catch {
    /* repo not loaded yet */
  }
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

/** Runs schema.sql batch-by-batch (mssql cannot execute GO separators). */
async function applySchema() {
  const file = path.join(__dirname, "schema.sql");
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
  try {
    const driverConfig = toDriverConfig(config);
    probe = await new (loadDriver().ConnectionPool)(driverConfig).connect();
    const res = await probe
      .request()
      .query("SELECT @@VERSION AS version, @@SERVERNAME AS name");
    const row = res.recordset[0] ?? {};
    return { ok: true, version: row.version, serverName: row.name };
  } catch (err) {
    return { ok: false, ...describeSqlError(err) };
  } finally {
    if (probe) await probe.close().catch(() => {});
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
  describeSqlError,
  parseServerField,
};