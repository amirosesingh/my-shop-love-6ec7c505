/**
 * SSMS-style administration connection.
 *
 * Deliberately separate from `pool.cjs` (the operational POS pool) so that
 * browsing databases, listing schema or running a read-only query can never
 * disturb sales or the sync worker. One pool is held open for the whole
 * session until the operator disconnects or the app exits.
 */
const { parseServerField, describeSqlError } = require("./pool.cjs");

const CONNECT_TIMEOUT_MS = 15_000;
const MAX_ROWS = 1000;

let driver = null;
let pool = null;
/** { server, database, auth, trustFallback } for the status badge. */
let session = null;
/** Names of databases the instance reported ONLINE — the only allowed context. */
let databases = [];

function loadDriver() {
  if (driver) return driver;
  try {
    driver = require("mssql");
  } catch (err) {
    const e = new Error("Local database driver not installed. Run: npm install mssql");
    e.code = "EDRIVER";
    e.cause = err;
    throw e;
  }
  return driver;
}

function hasWindowsDriver() {
  try {
    require.resolve("msnodesqlv8");
    return true;
  } catch {
    return false;
  }
}

/** Translates driver failures into something an operator can act on. */
function diagnose(err) {
  const base = describeSqlError(err);
  const text = `${base.code ?? ""} ${base.error ?? ""} ${base.originalMessage ?? ""}`.toLowerCase();
  let hint = base.hint;
  if (text.includes("certificate")) {
    hint =
      "The server presented a self-signed certificate. Turn 'Trust server certificate' on, or turn encryption off for a local instance.";
  } else if (text.includes("instance") && text.includes("not")) {
    hint =
      "The named instance could not be resolved. Start the 'SQL Server Browser' service in SQL Server Configuration Manager, or enter the instance's fixed TCP port.";
  } else if (text.includes("login failed")) {
    hint =
      "The server was reached but rejected the sign-in. Check the login name and password, and that SQL Server authentication (mixed mode) is enabled.";
  } else if (!hint && (text.includes("esocket") || text.includes("econnrefused"))) {
    hint =
      "Nothing answered on that port. Enable TCP/IP for the instance in SQL Server Configuration Manager and restart the SQL Server service.";
  }
  return { ...base, hint };
}

/** Builds the mssql config for one attempt. */
function buildConfig(input, { trustServerCertificate }) {
  loadDriver();
  const { host, instanceName, port, explicitPort } = parseServerField(
    input?.server,
    input?.port,
  );
  const database = String(input?.database || "master");
  const config = {
    server: host,
    database,
    connectionTimeout: CONNECT_TIMEOUT_MS,
    requestTimeout: CONNECT_TIMEOUT_MS,
    options: {
      encrypt: !!input?.encrypt,
      trustServerCertificate: !!trustServerCertificate,
      enableArithAbort: true,
      connectTimeout: CONNECT_TIMEOUT_MS,
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 60_000 },
  };
  if (instanceName) {
    config.options.instanceName = instanceName;
    if (explicitPort) config.port = port;
  } else {
    config.port = port;
  }
  if (input?.auth === "sql") {
    config.user = input.user;
    config.password = input.password;
  } else if (hasWindowsDriver()) {
    config.driver = "msnodesqlv8";
    config.options.trustedConnection = true;
    config.connectionString = [
      "Driver={ODBC Driver 17 for SQL Server}",
      `Server=${instanceName ? `${host}\\${instanceName}` : `${host},${port}`}`,
      `Database=${database}`,
      "Trusted_Connection=yes",
      `TrustServerCertificate=${trustServerCertificate ? "yes" : "no"}`,
    ].join(";");
  } else if (input?.user) {
    config.authentication = {
      type: "ntlm",
      options: {
        userName: input.user,
        password: input.password,
        domain: input.domain || process.env["USERDOMAIN"] || host,
      },
    };
  } else {
    const e = new Error(
      "Windows authentication needs the msnodesqlv8 driver on this machine. Install it, or use a SQL Server login.",
    );
    e.code = "EDRIVER";
    throw e;
  }
  return config;
}

const isCertificateError = (err) =>
  /certificate|ssl|self.signed/i.test(
    `${err?.message ?? ""} ${err?.originalError?.message ?? ""}`,
  );

async function openPool(input) {
  const wanted = input?.trustServerCertificate !== false;
  try {
    const p = await new (loadDriver().ConnectionPool)(
      buildConfig(input, { trustServerCertificate: wanted }),
    ).connect();
    return { pool: p, trustFallback: false };
  } catch (err) {
    // Auto-fallback: local instances almost never have a trusted certificate.
    if (!wanted && isCertificateError(err)) {
      const p = await new (loadDriver().ConnectionPool)(
        buildConfig(input, { trustServerCertificate: true }),
      ).connect();
      return { pool: p, trustFallback: true };
    }
    throw err;
  }
}

async function disconnect() {
  if (pool) {
    try {
      await pool.close();
    } catch {
      /* already gone */
    }
  }
  pool = null;
  session = null;
  databases = [];
  return { ok: true };
}

/**
 * Phase 1: handshake against `master`.
 * Phase 2: discover every ONLINE database so the UI can populate itself.
 */
async function connectInstance(input) {
  await disconnect();
  try {
    const opened = await openPool({ ...input, database: input?.database || "master" });
    pool = opened.pool;
    const meta = await pool
      .request()
      .query("SELECT @@SERVERNAME AS serverName, @@VERSION AS version, DB_NAME() AS activeDb");
    const row = meta.recordset[0] ?? {};
    const list = await pool
      .request()
      .query(
        "SELECT name, state_desc FROM sys.databases WHERE state_desc = 'ONLINE' ORDER BY name ASC",
      );
    databases = list.recordset.map((r) => String(r.name));
    session = {
      server: String(input?.server ?? ""),
      database: String(row.activeDb ?? "master"),
      auth: input?.auth === "sql" ? "sql" : "windows",
      serverName: row.serverName ?? null,
      version: row.version ?? null,
      trustFallback: opened.trustFallback,
    };
    return {
      ok: true,
      serverName: row.serverName ?? null,
      version: row.version ?? null,
      activeDb: session.database,
      usedTrustFallback: opened.trustFallback,
      databases: list.recordset.map((r) => ({
        name: String(r.name),
        state: String(r.state_desc),
      })),
    };
  } catch (err) {
    await disconnect();
    return { ok: false, ...diagnose(err) };
  }
}

function requirePool() {
  if (!pool) {
    const e = new Error("Not connected to a SQL Server instance");
    e.code = "ENOTCONNECTED";
    throw e;
  }
  return pool;
}

/** Only names the instance itself reported may enter a `USE [...]` statement. */
function safeDatabase(name) {
  const wanted = String(name ?? "").trim();
  if (!wanted) return null;
  const match = databases.find((d) => d.toLowerCase() === wanted.toLowerCase());
  if (!match) {
    const e = new Error(`Unknown database "${wanted}" on this instance`);
    e.code = "EBADDB";
    throw e;
  }
  return match;
}

/** Runs a statement inside the chosen database without touching the pool default. */
async function inDatabase(dbName, text, binds) {
  const p = requirePool();
  const db = safeDatabase(dbName);
  const request = p.request();
  for (const [key, value] of Object.entries(binds ?? {})) request.input(key, value);
  const prefix = db ? `USE [${db.replace(/]/g, "]]")}];\n` : "";
  return request.query(prefix + text);
}

async function listDatabases() {
  try {
    const res = await requirePool()
      .request()
      .query(
        "SELECT name, state_desc FROM sys.databases WHERE state_desc = 'ONLINE' ORDER BY name ASC",
      );
    databases = res.recordset.map((r) => String(r.name));
    return {
      ok: true,
      databases: res.recordset.map((r) => ({
        name: String(r.name),
        state: String(r.state_desc),
      })),
    };
  } catch (err) {
    return { ok: false, ...diagnose(err) };
  }
}

async function getTables(dbName) {
  try {
    const res = await inDatabase(
      dbName,
      `SELECT TABLE_SCHEMA AS [schema], TABLE_NAME AS [name], TABLE_TYPE AS [type]
         FROM INFORMATION_SCHEMA.TABLES
        ORDER BY TABLE_SCHEMA, TABLE_NAME`,
    );
    if (session) session.database = safeDatabase(dbName) ?? session.database;
    return {
      ok: true,
      tables: res.recordset.map((r) => ({
        schema: String(r.schema),
        name: String(r.name),
        type: r.type === "VIEW" ? "view" : "table",
      })),
    };
  } catch (err) {
    return { ok: false, tables: [], ...diagnose(err) };
  }
}

async function getTableColumns(dbName, tableName, schemaName) {
  try {
    const res = await inDatabase(
      dbName,
      `SELECT COLUMN_NAME AS [name], DATA_TYPE AS [type],
              CHARACTER_MAXIMUM_LENGTH AS [length], IS_NULLABLE AS [nullable],
              COLUMN_DEFAULT AS [def], ORDINAL_POSITION AS [position]
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @table
          AND (@schema IS NULL OR TABLE_SCHEMA = @schema)
        ORDER BY ORDINAL_POSITION`,
      { table: String(tableName ?? ""), schema: schemaName ? String(schemaName) : null },
    );
    return {
      ok: true,
      columns: res.recordset.map((r) => ({
        name: String(r.name),
        type: String(r.type),
        length: r.length ?? null,
        nullable: String(r.nullable).toUpperCase() === "YES",
        defaultValue: r.def ?? null,
      })),
    };
  } catch (err) {
    return { ok: false, columns: [], ...diagnose(err) };
  }
}

const FORBIDDEN =
  /\b(insert|update|delete|merge|drop|create|alter|truncate|grant|revoke|backup|restore|exec|execute|sp_|xp_|shutdown|reconfigure|into)\b/i;

/** The explorer is read-only: one SELECT/WITH statement, nothing else. */
function validateReadOnly(text) {
  const query = String(text ?? "").trim().replace(/;+\s*$/, "");
  if (!query) return { ok: false, error: "Enter a query to run." };
  if (query.includes(";"))
    return { ok: false, error: "Run one statement at a time — remove the extra ';'." };
  if (!/^(select|with)\b/i.test(query))
    return { ok: false, error: "Only SELECT statements can be run here." };
  const stripped = query.replace(/'[^']*'/g, "''").replace(/--[^\n]*/g, "");
  if (FORBIDDEN.test(stripped))
    return {
      ok: false,
      error: "This editor is read-only — statements that change data or schema are blocked.",
    };
  return { ok: true, query };
}

async function executeQuery(dbName, queryText) {
  const check = validateReadOnly(queryText);
  if (!check.ok) return { ok: false, error: check.error, code: "EREADONLY", hint: null };
  const started = Date.now();
  try {
    const res = await inDatabase(dbName, check.query);
    const rows = (res.recordset ?? []).slice(0, MAX_ROWS);
    const columns = res.recordset?.columns
      ? Object.keys(res.recordset.columns)
      : Object.keys(rows[0] ?? {});
    return {
      ok: true,
      columns,
      rows: rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]),
        ),
      ),
      rowCount: res.recordset?.length ?? 0,
      truncated: (res.recordset?.length ?? 0) > MAX_ROWS,
      elapsedMs: Date.now() - started,
    };
  } catch (err) {
    return { ok: false, elapsedMs: Date.now() - started, ...diagnose(err) };
  }
}

function status() {
  return {
    connected: !!pool,
    server: session?.server ?? null,
    serverName: session?.serverName ?? null,
    database: session?.database ?? null,
    auth: session?.auth ?? null,
    usedTrustFallback: session?.trustFallback ?? false,
  };
}

module.exports = {
  connectInstance,
  listDatabases,
  getTables,
  getTableColumns,
  executeQuery,
  disconnect,
  status,
  validateReadOnly,
};
