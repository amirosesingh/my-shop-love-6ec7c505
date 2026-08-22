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
/**
 * Hard ceiling for one wizard handshake. Whatever the driver does, the slot is
 * released after this so a stuck attempt can never lock out the next one.
 */
const HANDSHAKE_DEADLINE_MS = 30_000;
/** How long a fresh attempt waits for a cancelled predecessor to let go. */
const RELEASE_WAIT_MS = 1_500;
/** Ceiling for the metadata/catalogue queries that follow a successful login. */
const QUERY_DEADLINE_MS = 10_000;

let pool = null;
/** { server, database, auth, trustFallback } for the status badge. */
let session = null;
/** Names of databases the instance reported ONLINE — the only allowed context. */
let databases = [];
/**
 * Exactly one handshake may be in flight.
 *
 * Without this, a second "Run checks" started another attempt ladder while the
 * first was still walking one, and `connectInstance`'s opening `disconnect()`
 * tore down the pool the first run was about to return — which is how the
 * wizard could sit on "Loading…" for ever.
 */
let inFlight = null;

let attemptSeq = 0;
const newAttemptId = () => `att_${Date.now().toString(36)}_${(++attemptSeq).toString(36)}`;

/** Console diagnostics — identity and timing only, never credentials. */
function trace(run, event, extra) {
  const detail = extra ? ` ${JSON.stringify(extra)}` : "";
  // eslint-disable-next-line no-console
  console.log(
    `[sqladmin] attempt=${run.attemptId} stage=${run.stage} event=${event} elapsed=${
      Date.now() - run.startedAt
    }ms${detail}`,
  );
}

/** Rejects instead of hanging when a request never answers. */
function withDeadline(promise, ms, code, message) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_r, reject) => {
      timer = setTimeout(() => {
        const err = new Error(message);
        err.code = code;
        reject(err);
      }, ms);
    }),
  ]);
}

/** Translates driver failures into something an operator can act on. */
function diagnose(err) {
  const base = describeSqlError(err);
  const text = `${base.code ?? ""} ${base.error ?? ""} ${base.originalMessage ?? ""}`.toLowerCase();
  let hint = base.hint;
  if (base.code === "ECANCELLED") {
    hint = "The attempt was stopped before it finished.";
  } else if (base.code === "EBUDGET") {
    hint =
      "Earlier driver or encryption combinations used the connection deadline. Review the attempted combinations below; this is not a failed port probe.";
  } else if (base.code === "ETIMEOUT" || /did not complete|timed out/.test(text)) {
    hint =
      "The SQL driver did not finish this sign-in combination. Check the ODBC driver and TLS/encryption settings; the separate TCP step determines whether the port is reachable.";
  } else if (/im002|data source name not found|no default driver/.test(text)) {
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
    budgetMs: Number(input?.budgetMs) > 0 ? Number(input.budgetMs) : undefined,
    isCancelled: typeof input?.isCancelled === "function" ? input.isCancelled : undefined,
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
 * Aborts the running handshake (dialog closed, or operator pressed cancel).
 *
 * Releasing `inFlight` here — not only in the original attempt's `finally` — is
 * what makes the next attempt possible immediately. The abandoned run is
 * flagged, so whatever it returns later is discarded instead of adopted.
 */
async function cancel(attemptId) {
  const run = inFlight;
  if (run && (!attemptId || run.attemptId === attemptId)) {
    run.cancelled = true;
    if (run.timer) clearTimeout(run.timer);
    inFlight = null;
    trace(run, "cancelled");
  }
  await disconnect();
  return { ok: true, cancelled: true, attemptId: run?.attemptId ?? attemptId ?? null };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wizard step 1 — raw TCP reachability.
 *
 * Opening a plain socket answers the "is the port open at all" question in two
 * seconds, long before the SQL driver would give up with a generic timeout, so
 * a blocked firewall or a disabled TCP/IP protocol is named for what it is.
 */
async function probePort(input) {
  // A named instance rarely listens on 1433 — ask SQL Browser first so the
  // probe (and the handshake after it) target the port really in use. In
  // direct mode the operator supplied the port, so no lookup happens at all.
  const target = await resolveTarget({
    server: input?.server ?? input?.host,
    port: input?.port,
    directConnect: input?.directConnect === true,
  });
  const { host, port, instanceName, browserAnswered } = target;
  const started = Date.now();
  // Named instances commonly use dynamic ports. If Browser is stopped and no
  // fixed port was supplied, guessing 1433 is misleading; let the SQL driver
  // resolve HOST\INSTANCE directly during the authoritative handshake.
  if (instanceName && !target.portKnown) {
    return {
      ok: true,
      skipped: true,
      host,
      port: null,
      instanceName,
      browserAnswered: false,
      elapsedMs: Date.now() - started,
      hint: "Dynamic port not advertised; the SQL driver will connect to the named instance directly.",
    };
  }

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
        stage: "port",
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
  // A previous attempt that is still walking its ladder must never block a
  // deliberate retry: it is cancelled and superseded, never a reason to refuse.
  if (inFlight) {
    await cancel();
    for (let waited = 0; inFlight && waited < RELEASE_WAIT_MS; waited += 100) await sleep(100);
    inFlight = null;
  }
  const run = {
    attemptId: String(input?.attemptId || newAttemptId()),
    startedAt: Date.now(),
    stage: "driver",
    cancelled: false,
    timer: null,
  };
  // Hard release: however the driver behaves, the slot frees itself.
  run.timer = setTimeout(() => {
    run.cancelled = true;
    if (inFlight === run) inFlight = null;
    trace(run, "deadline");
  }, HANDSHAKE_DEADLINE_MS);
  inFlight = run;
  trace(run, "start");
  await disconnect();
  const finalise = (result) => ({
    ...result,
    attemptId: run.attemptId,
    stage: result.stage ?? run.stage,
    status: result.ok ? "success" : run.cancelled ? "cancelled" : (result.status ?? "failed"),
    elapsedMs: Date.now() - run.startedAt,
  });
  try {
    const openPromise = openPool({
      ...input,
      database: input?.database || "master",
      isCancelled: () => run.cancelled,
    });
    // A late pool from an abandoned attempt must not stay open.
    openPromise
      .then((o) => {
        if (run.cancelled && o?.pool) void o.pool.close().catch(() => {});
      })
      .catch(() => {});
    const opened = await openPromise;
    if (run.cancelled) {
      await opened.pool.close().catch(() => {});
      return finalise({
        ok: false,
        code: "ECANCELLED",
        stage: "driver",
        status: "cancelled",
        error: "The connection attempt was cancelled.",
      });
    }
    run.stage = "database";
    pool = opened.pool;
    const meta = await withDeadline(
      pool.request().query("SELECT @@SERVERNAME AS serverName, @@VERSION AS version, DB_NAME() AS activeDb"),
      QUERY_DEADLINE_MS,
      "ETIMEOUT",
      "The server signed in but did not answer the identification query in time.",
    );
    const row = meta.recordset[0] ?? {};
    const list = await withDeadline(
      pool
        .request()
        .query(
          "SELECT name, state_desc FROM sys.databases WHERE state_desc = 'ONLINE' AND HAS_DBACCESS(name) = 1 ORDER BY name ASC",
        ),
      QUERY_DEADLINE_MS,
      "ETIMEOUT",
      "The database list did not arrive in time.",
    );
    if (run.cancelled) {
      await disconnect();
      return finalise({
        ok: false,
        code: "ECANCELLED",
        stage: "database",
        status: "cancelled",
        error: "The connection attempt was cancelled.",
      });
    }
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
    trace(run, "success");
    return finalise({
      ok: true,
      stage: "write",
      serverName: row.serverName ?? null,
      version: row.version ?? null,
      activeDb: session.database,
      usedTrustFallback: opened.trustFallback,
      resolved: opened.attempt,
      databases: list.recordset.map((r) => ({
        name: String(r.name),
        state: String(r.state_desc),
      })),
    });
  } catch (err) {
    await disconnect();
    trace(run, run.cancelled ? "cancelled" : "failed", { code: err?.code ?? null });
    return finalise({ ok: false, ...diagnose(err) });
  } finally {
    if (run.timer) clearTimeout(run.timer);
    if (inFlight === run) inFlight = null;
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
    busy: !!inFlight,
    attemptId: inFlight?.attemptId ?? null,
    stage: inFlight?.stage ?? null,
    server: session?.server ?? null,
    serverName: session?.serverName ?? null,
    database: session?.database ?? null,
    auth: session?.auth ?? null,
    usedTrustFallback: session?.trustFallback ?? false,
  };
}

/**
 * The deliberate schema-repair channel. Unlike executeQuery this runs DDL,
 * but only the guarded batches the main process extracted from the master
 * schema file — never free-form text from the renderer. Each batch runs
 * on its own so one failure cannot hide the ones that follow.
 */
async function runRepair(dbName, batches) {
  requirePool();
  const list = (Array.isArray(batches) ? batches : [])
    .map((b) => String(b ?? "").trim())
    .filter(Boolean);
  if (!list.length) return { ok: false, error: "No repair statements were supplied." };
  const results = [];
  for (const batch of list) {
    try {
      await withDeadline(
        inDatabase(dbName, batch),
        30_000,
        "ETIMEOUT",
        "A repair statement did not finish in time.",
      );
      results.push({ ok: true });
    } catch (err) {
      results.push({ ok: false, ...describeSqlError(err) });
    }
  }
  const failed = results.filter((r) => !r.ok);
  return {
    ok: failed.length === 0,
    ran: results.length - failed.length,
    total: results.length,
    results,
    error: failed.length
      ? (failed[0].error ?? failed[0].originalMessage ?? "A repair statement failed")
      : null,
  };
}

module.exports = {
  connectInstance,
  cancel,
  probePort,
  lockDatabase,
  listDatabases,
  getTables,
  getTableColumns,
  executeQuery,
  runRepair,
  disconnect,
  status,
  validateReadOnly,
};
