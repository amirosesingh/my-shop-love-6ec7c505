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
  } catch (err) {
    const e = new Error(WINDOWS_AUTH_HINT);
    e.cause = err;
    throw e;
  }
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
  const base = {
    server: config.server,
    database: config.database,
    port: Number(config.port) || 1433,
    options: {
      encrypt: !!config.encrypt,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  };
  if (config.auth === "windows") {
    // msnodesqlv8 driver handles integrated auth on Windows.
    requireWindowsDriver();
    base.driver = "msnodesqlv8";
    base.options.trustedConnection = true;
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
  const driverConfig = toDriverConfig(config);
  const probe = await new (loadDriver().ConnectionPool)(driverConfig).connect();
  try {
    const res = await probe.request().query("SELECT @@VERSION AS version");
    return { ok: true, version: res.recordset[0].version };
  } finally {
    await probe.close();
  }
}

module.exports = { sql, connect, close, getPool, getConfig, test, applySchema };