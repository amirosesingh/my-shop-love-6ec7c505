/**
 * SSMS-style administration connection.
 *
 * Deliberately separate from `pool.cjs` (the operational POS pool) so that
 * browsing databases, listing schema or running a read-only query can never
 * disturb sales or the sync worker. One pool is held open for the whole
 * session until the operator disconnects or the app exits.
 */
const { parseServerField, describeSqlError, openConnection, resolveTarget } = require("./pool.cjs");
const net = require("node:net");

const CONNECT_TIMEOUT_MS = 15_000;
const MAX_ROWS = 1000;
const SOCKET_TIMEOUT_MS = 2_000;

let pool = null;
/** { server, database, auth, trustFallback } for the status badge. */
let session = null;
/** Names of databases the instance reported ONLINE — the only allowed context. */
let databases = [];

/** Translates driver failures into something an operator can act on. */
function diagnose(err) {
  const base = describeSqlError(err);
  const text = `${base.code ?? ""} ${base.error ?? ""} ${base.originalMessage ?? ""}`.toLowerCase();
  let hint = base.hint;
  if (/im002|data source name not found|no default driver/.test(text)) {
    hint =
      "No suitable ODBC driver is installed for Windows authentication. Install 'ODBC Driver 18 for SQL Server' from Microsoft, or use a SQL Server login.";
  } else if (text.includes("certificate")) {
    hint =
      "The server presented a self-signed certificate. Turn 'Trust server certificate' on, or turn encryption off for a local instance.";
  } else if (text.includes("instance") && text.includes("not")) {
    hint =
      "The named instance could not be resolved. Start the 'SQL Server Browser' service in SQL Server Configuration Manager, or enter the instance's fixed TCP port.";
  } else if (text.includes("login failed for user")) {
    hint =
      "The server was reached but rejected the sign-in. For a SQL login, check the name/password and that mixed-mode authentication is enabled (Server Properties > Security > SQL Server and Windows Authentication mode), then restart the service. For Windows authentication, the signed-in Windows account needs a login on the instance.";
  } else if (!hint && (text.includes("esocket") || text.includes("econnrefused"))) {
    hint =
      "Nothing answered on that port. Enable TCP/IP for the instance in SQL Server Configuration Manager and restart the SQL Server service.";
  }
  return { ...base, hint, attempts: err?.attempts ?? [] };
}

/**
 * One shared engine with the operational pool: resolved instance port, ODBC
 * driver selection for Windows auth, and the encryption retry ladder.
 */
async function openPool(input) {
  const opened = await openConnection({
    ...input,
    database: String(input?.database || "master"),
    timeout: CONNECT_TIMEOUT_MS,
  });
  return {
    pool: opened.pool,
    trustFallback:
      input?.trustServerCertificate === false && opened.attempt.trustServerCertificate,
    attempt: opened.attempt,
  };
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
 * Wizard step 1 — raw TCP reachability.
 *
 * Opening a plain socket answers the "is the port open at all" question in two
 * seconds, long before the SQL driver would give up with a generic timeout, so
 * a blocked firewall or a disabled TCP/IP protocol is named for what it is.
 */
async function probePort(input) {
  // A named instance rarely listens on 1433 — ask SQL Browser first so the
  // probe (and the handshake after it) target the port really in use.
  const target = await resolveTarget({
    server: input?.server ?? input?.host,
    port: input?.port,
  });
  const { host, port, instanceName, browserAnswered } = target;
  const started = Date.now();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        host,
        port,
        instanceName: instanceName || null,
        browserAnswered,
        elapsedMs: Date.now() - started,
        ...result,
      });
    };
    const blocked = () =>
      finish({
        ok: false,
        code: "EPORTCLOSED",
        error: `Firewall/Port Error: TCP Port ${port} on ${host}${
          instanceName ? ` (instance ${instanceName})` : ""
        } is closed or blocked. Ensure SQL Server TCP/IP protocol is enabled in SQL Server Configuration Manager.`,
        hint: instanceName && !browserAnswered
          ? "The SQL Server Browser service did not answer on UDP 1434, so the instance's port could not be discovered. Start that service, or type the instance's fixed TCP port as SERVER\\INSTANCE,PORT."
          : "Also allow the port through Windows Defender Firewall and restart the SQL Server service after enabling TCP/IP.",
      });
    socket.setTimeout(SOCKET_TIMEOUT_MS);
    socket.once("connect", () => finish({ ok: true }));
    socket.once("timeout", blocked);
    socket.once("error", blocked);
    socket.connect(port, host);
  });
}

/**
 * Wizard step 4 — lock the chosen database.
 *
 * Re-opens the administration pool directly against the target so the operator
 * finds out now, not at first sale, whether their login can actually use it.
 */
async function lockDatabase(input) {
  const wanted = String(input?.database ?? "").trim();
  if (!wanted) return { ok: false, error: "Choose a target database first.", code: "EBADDB" };
  try {
    safeDatabase(wanted);
  } catch (err) {
    return { ok: false, ...diagnose(err) };
  }
  const previous = session;
  try {
    const opened = await openPool({ ...input, database: wanted });
    if (pool) await pool.close().catch(() => {});
    pool = opened.pool;
    const meta = await pool
      .request()
      .query("SELECT DB_NAME() AS activeDb, @@SERVERNAME AS serverName");
    const row = meta.recordset[0] ?? {};
    session = {
      server: String(input?.server ?? previous?.server ?? ""),
      database: String(row.activeDb ?? wanted),
      auth: input?.auth === "sql" ? "sql" : "windows",
      serverName: row.serverName ?? previous?.serverName ?? null,
      version: previous?.version ?? null,
      trustFallback: opened.trustFallback,
    };
    return { ok: true, activeDb: session.database, usedTrustFallback: opened.trustFallback };
  } catch (err) {
    return { ok: false, ...diagnose(err) };
  }
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
        "SELECT name, state_desc FROM sys.databases WHERE state_desc = 'ONLINE' AND HAS_DBACCESS(name) = 1 ORDER BY name ASC",
      );
    databases = list.recordset.map((r) => String(r.name));
    session = {
      server: String(input?.server ?? ""),
      database: String(row.activeDb ?? "master"),
      auth: input?.auth === "sql" ? "sql" : "windows",
      serverName: row.serverName ?? null,
      version: row.version ?? null,
      trustFallback: opened.trustFallback,
      resolved: opened.attempt,
    };
    return {
      ok: true,
      serverName: row.serverName ?? null,
      version: row.version ?? null,
      activeDb: session.database,
      usedTrustFallback: opened.trustFallback,
      resolved: opened.attempt,
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
        "SELECT name, state_desc FROM sys.databases WHERE state_desc = 'ONLINE' AND HAS_DBACCESS(name) = 1 ORDER BY name ASC",
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
  /\b(insert|update|delete|merge|drop|create|alter|truncate|grant|revoke|deny|backup|restore|exec|execute|sp_\w*|xp_\w*|shutdown|reconfigure|openrowset|opendatasource|bulk|waitfor|into)\b/i;

/**
 * The explorer is read-only: exactly one SELECT/WITH statement, nothing else.
 * Comments are stripped before the keyword scan so `/*x*\/DROP` cannot sneak
 * past, and any remaining `;` is treated as a second statement.
 */
function validateReadOnly(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return { ok: false, error: "Enter a query to run." };
  // Comment-free, literal-free copy used for every structural check.
  const stripped = raw
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .trim()
    .replace(/;+\s*$/, "");
  if (!stripped) return { ok: false, error: "Enter a query to run." };
  if (stripped.includes(";"))
    return { ok: false, error: "Run one statement at a time — remove the extra ';'." };
  if (!/^(select|with)\b/i.test(stripped))
    return { ok: false, error: "Only SELECT statements can be run here." };
  if (FORBIDDEN.test(stripped))
    return {
      ok: false,
      error: "This editor is read-only — statements that change data or schema are blocked.",
    };
  return { ok: true, query: raw.replace(/;+\s*$/, "") };
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
  probePort,
  lockDatabase,
  listDatabases,
  getTables,
  getTableColumns,
  executeQuery,
  disconnect,
  status,
  validateReadOnly,
};
