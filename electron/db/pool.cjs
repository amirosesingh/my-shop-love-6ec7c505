/**
 * Connection pool for the local Microsoft SQL Server instance.
 *
 * The renderer never talks to SQL Server; only this module (main process) does.
 */
const fs = require("node:fs");
const path = require("node:path");
const sql = require("mssql");

let pool = null;
let activeConfig = null;

function toDriverConfig(config) {
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
  pool = await new sql.ConnectionPool(toDriverConfig(config)).connect();
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
  const probe = await new sql.ConnectionPool(toDriverConfig(config)).connect();
  try {
    const res = await probe.request().query("SELECT @@VERSION AS version");
    return { ok: true, version: res.recordset[0].version };
  } finally {
    await probe.close();
  }
}

module.exports = { sql, connect, close, getPool, getConfig, test, applySchema };