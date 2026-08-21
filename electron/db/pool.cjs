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
/** Hard ceiling for the whole attempt ladder — the UI must always get an answer. */
const LADDER_BUDGET_MS = 40_000;
/**
 * Direct mode has a single route (host,port) and no discovery, so a dead port
 * or a rejected login must surface in seconds rather than after the budget
 * reserved for SQL Browser based discovery.
 */
const DIRECT_BUDGET_MS = 12_000;
/** No single attempt may eat the whole budget. */
const ATTEMPT_TIMEOUT_MS = 10_000;
/** The ladder stays short on purpose: four tries fit inside the budget. */
const MAX_ATTEMPTS_PER_DRIVER = 4;

/** True when the operator asked for a plain `host,port` connection. */
const isDirectConnect = (config) => config?.directConnect === true;


/* ------------------------- connection diagnostics ------------------------- */

let logFile = null;
let logResolved = false;

/** `<userData>/connection.log`, resolved lazily so tests can load this module. */
function connectionLogFile() {
  if (logResolved) return logFile;
  logResolved = true;
  try {
    const { app } = require("electron");
    logFile = path.join(app.getPath("userData"), "connection.log");
  } catch {
    logFile = null;
  }
  return logFile;
}

/**
 * One structured line per sub-step (driver load, target resolution, Browser
 * lookup, every ladder attempt, verification). Never any credential value.
 */
function logConnection(event, detail) {
  const line = `${new Date().toISOString()} [sqlconn] ${event}${
    detail ? ` ${JSON.stringify(detail)}` : ""
  }`;
  // eslint-disable-next-line no-console
  console.log(line);
  const file = connectionLogFile();
  if (!file) return;
  try {
    // Rotate before the log can grow without bound on a long-running till.
    if (fs.existsSync(file) && fs.statSync(file).size > 512 * 1024) {
      fs.renameSync(file, `${file}.1`);
    }
    fs.appendFileSync(file, `${line}\n`, "utf8");
  } catch {
    /* diagnostics must never break a connection */
  }
}


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

/**
 * Names of the registry values under the ODBC Drivers key.
 *
 * Each installed driver is one value line: `    <name>    REG_SZ    Installed`.
 * Matching the whole dump as one string made "SQL Server" match any line, so
 * uninstalled drivers were tried and burned the connection budget.
 */
function parseOdbcRegistry(dump) {
  const names = [];
  for (const raw of String(dump ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("HKEY_")) continue;
    const match = /^(.+?)\s{2,}REG_SZ\s{2,}(.*)$/.exec(line);
    if (!match) continue;
    const name = match[1].trim();
    // "Not installed" must not match — only a positive Installed value counts.
    if (!/^installed$/i.test(match[2].trim())) continue;
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * ODBC drivers actually installed on this PC, best first.
 *
 * Returns `{ drivers, detected }`. `detected` is false when the registry could
 * not be read at all — the caller then falls back to the two most likely
 * drivers rather than walking every name ever shipped.
 */
function detectOdbcDrivers() {
  if (odbcCache) return odbcCache;
  let installed = [];
  let detected = false;
  if (process.platform === "win32") {
    try {
      const out = execFileSync(
        "reg",
        ["query", "HKLM\\SOFTWARE\\ODBC\\ODBCINST.INI\\ODBC Drivers"],
        { timeout: 4000, windowsHide: true, encoding: "utf8" },
      );
      installed = parseOdbcRegistry(out);
      detected = true;
    } catch (err) {
      logConnection("odbc.registry-unreadable", { error: err?.message ?? String(err) });
      installed = [];
      detected = false;
    }
  }
  const lower = installed.map((n) => n.toLowerCase());
  const ranked = KNOWN_ODBC_DRIVERS.filter((name) => lower.includes(name.toLowerCase()));
  // A driver we do not rank but that IS installed still beats guessing.
  const extras = installed.filter(
    (name) => /sql server/i.test(name) && !ranked.some((r) => r.toLowerCase() === name.toLowerCase()),
  );
  const drivers = detected
    ? [...ranked, ...extras]
    : KNOWN_ODBC_DRIVERS.slice(0, 2);
  odbcCache = { drivers, detected, installed };
  logConnection("odbc.detected", { detected, drivers });
  return odbcCache;
}

/** Backwards-compatible list form used by the diagnostics UI. */
function installedOdbcDrivers() {
  return detectOdbcDrivers().drivers;
}

function requireWindowsDriver() {
  // Both halves are needed: the native ODBC binding AND the mssql wrapper that
  // actually speaks to it. Without the wrapper, `driver: "msnodesqlv8"` is
  // silently ignored and the sign-in is attempted with no credentials.
  try {
    require.resolve("msnodesqlv8");
    require.resolve("mssql/msnodesqlv8");
    return true;
  } catch {
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
  // A separately supplied port is as explicit as HOST,PORT.
  let explicitPort = Number(fallbackPort) > 0;
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
  const text = `${code ?? ""} ${message} ${originalMessage ?? ""}`.toLowerCase();
  const stage =
    code === "EDRIVER" || code === "EBUDGET" || /im002|driver.*not found|data source name not found/.test(text)
      ? "driver"
      : code === "ELOGIN" || /login failed|password did not match/.test(text)
        ? "login"
        : /certificate|tls|ssl|encrypt/.test(text)
          ? "tls"
          : code === "ETIMEOUT_INSTANCE_LOOKUP" || code === "EINSTLOOKUP"
            ? "instance_lookup"
            : code === "EPORTCLOSED" || code === "ECONNREFUSED" || code === "ENOTFOUND"
              ? "port"
              : code === "ETIMEOUT" || code === "ETIMEDOUT"
                ? "driver"
                : "database";
  return {
    error: message,
    code,
    originalMessage,
    hint: (code && hints[code]) || null,
    stage,
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
  // A port the TCP step already proved open outranks any further lookup.
  const proven = Number(config.resolvedPort);
  if (Number.isFinite(proven) && proven > 0) {
    port = proven;
    portKnown = true;
    logConnection("target.proven-port", { host: parsed.host, port });
    return { ...parsed, port, portKnown, browserAnswered, provenPort: true };
  }
  if (parsed.instanceName && !parsed.explicitPort) {
    let discovered = null;
    const started = Date.now();
    try {
      discovered = await require("./discover.cjs").instancePort(parsed.host, parsed.instanceName);
    } catch (err) {
      logConnection("browser.lookup-failed", { error: err?.message ?? String(err) });
      discovered = null;
    }
    logConnection("browser.lookup", {
      host: parsed.host,
      instance: parsed.instanceName,
      port: discovered,
      elapsedMs: Date.now() - started,
    });
    if (discovered) {
      port = discovered;
      portKnown = true;
      browserAnswered = true;
    }
  }
  logConnection("target.resolved", {
    host: parsed.host,
    instance: parsed.instanceName || null,
    port,
    portKnown,
    browserAnswered,
  });
  return { ...parsed, port, portKnown, browserAnswered, provenPort: false };
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

/** Per-attempt deadline: never longer than what is left of the overall budget. */
function attemptTimeoutOf(config, remainingMs) {
  const wanted = Math.min(timeoutOf(config), ATTEMPT_TIMEOUT_MS);
  return Math.max(1_000, Math.min(wanted, remainingMs));
}

/**
 * Races a driver connect against our own clock.
 *
 * The drivers do not always honour their own connect timeout (msnodesqlv8 in
 * particular can sit on a half-open socket), which is exactly how the wizard
 * ended up spinning for ever. Whatever the driver does, this settles.
 */
function withDeadline(work, ms, code, message) {
  let timer = null;
  return Promise.race([
    Promise.resolve(work).finally(() => clearTimeout(timer)),
    new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        const e = new Error(message);
        e.code = code;
        reject(e);
      }, ms);
    }),
  ]);
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
  // Instance-name resolution is only a fallback: when the port is already
  // known (typed, proven by the TCP step, or answered by SQL Browser) it is
  // the proven route and asking the driver to resolve the instance again only
  // wastes the budget.
  if (target.instanceName && !target.provenPort) routes.push(false);
  if (!routes.length) routes.push(true);

  const native = config.auth === "windows" && requireWindowsDriver();
  const odbc = native ? detectOdbcDrivers() : { drivers: [null], detected: true };
  const drivers = odbc.drivers;
  if (config.auth === "windows" && !native && !config.user) {
    const e = new Error(WINDOWS_AUTH_HINT);
    e.code = "EDRIVER";
    throw e;
  }
  if (native && !drivers.length) {
    const e = new Error(
      "No ODBC driver for SQL Server is installed on this PC, so Windows authentication cannot be used. Install 'ODBC Driver 18 for SQL Server' from Microsoft, or switch to a SQL Server login.",
    );
    e.code = "EDRIVER";
    throw e;
  }

  const attempts = [];
  for (const odbcDriver of drivers) {
    const perDriver = [];
    for (const byPort of routes) {
      for (const sec of security) {
        perDriver.push({
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
    // Best first, and short: four combinations comfortably fit the budget,
    // while fifteen guaranteed a timeout before any of them could answer.
    attempts.push(...perDriver.slice(0, MAX_ATTEMPTS_PER_DRIVER));
  }
  logConnection("ladder.planned", {
    attempts: attempts.length,
    drivers: native ? drivers : ["tedious"],
    odbcDetected: odbc.detected,
    routes: routes.map((byPort) => (byPort ? "port" : "instance")),
  });
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
  const budget = Number(config.budgetMs) > 0 ? Number(config.budgetMs) : LADDER_BUDGET_MS;
  const deadline = Date.now() + budget;
  const cancelled = () => typeof config.isCancelled === "function" && config.isCancelled();
  /** ODBC drivers proved absent, and the one that actually answered. */
  const deadDrivers = new Set();
  let usableDriver = null;
  for (const attempt of attempts) {
    if (cancelled()) {
      const e = new Error("The connection attempt was cancelled.");
      e.code = "ECANCELLED";
      e.attempts = tried;
      throw e;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 1_000) {
      const e = new Error(
        `The connection budget ended before the next sign-in combination could be tried${attempt?.label ? ` (${attempt.label})` : ""}.`,
      );
      e.code = "EBUDGET";
      e.attempts = tried;
      e.target = target;
      throw e;
    }
    let opening = null;
    if (deadDrivers.has(attempt.odbcDriver)) continue;
    if (usableDriver && attempt.odbcDriver !== usableDriver) continue;
    const startedAt = Date.now();
    logConnection("attempt.start", { label: attempt.label, remainingMs: remaining });
    try {
      const mssql = native ? loadNativeDriver() : loadDriver();
      opening = new mssql.ConnectionPool(attempt.driverConfig);
      // Unhandled 'error' events on a pool we are about to drop must not crash
      // the main process.
      opening.on("error", () => {});
      const opened = await withDeadline(
        opening.connect(),
        attemptTimeoutOf(config, remaining),
        "ETIMEOUT",
        "The sign-in did not complete before the deadline.",
      );
      logConnection("attempt.ok", { label: attempt.label, elapsedMs: Date.now() - startedAt });
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
      // The driver may still settle later; make sure the socket is dropped.
      if (opening) {
        try {
          await opening.close();
        } catch {
          /* never opened */
        }
      }
      tried.push({ label: attempt.label, code: err?.code ?? null, error: err?.message ?? String(err) });
      logConnection("attempt.fail", {
        label: attempt.label,
        code: err?.code ?? null,
        elapsedMs: Date.now() - startedAt,
        error: err?.message ?? String(err),
      });
      // A rejected sign-in is final: no other port, driver or TLS setting fixes it.
      if (isLoginFailure(err)) break;
      if (native) {
        // A driver that is simply not installed is skipped entirely; a driver
        // that answered is the right one, so no other driver is worth trying.
        if (isOdbcDriverMissing(err)) deadDrivers.add(attempt.odbcDriver);
        else usableDriver = attempt.odbcDriver;
      }
    }
  }
  if (cancelled()) {
    const e = new Error("The connection attempt was cancelled.");
    e.code = "ECANCELLED";
    e.attempts = tried;
    throw e;
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
    const opened = await openConnection(config);
    probe = opened.pool;
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
      attempt: opened.attempt,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      ...describeSqlError(err),
      attempts: err?.attempts ?? [],
    };
  } finally {
    if (probe) await probe.close().catch(() => {});
  }
}

/** Reads the master schema file so the UI can show it before anything runs. */
function readSchema() {
  return readSchemaFile();
}

/**
 * Proves the open pool is actually usable: one round-trip that names the
 * database it landed in. A pool object alone is not evidence of a working
 * database, so nothing reports "connected" until this succeeds.
 */
async function verify() {
  if (!pool) throw new Error("Local database is not connected");
  const started = Date.now();
  const res = await pool
    .request()
    .query("SELECT 1 AS ok, DB_NAME() AS activeDb, @@SERVERNAME AS serverName");
  const row = res.recordset[0] ?? {};
  return {
    ok: true,
    activeDb: row.activeDb ?? activeConfig?.database ?? null,
    serverName: row.serverName ?? null,
    latencyMs: Date.now() - started,
  };
}

function readSchemaFile() {
  try {
    const file = schemaFile();
    const text = fs.readFileSync(file, "utf8");
    const tables = [...text.matchAll(/CREATE TABLE dbo\.(\w+)/gi)].map((m) => m[1]);
    return { ok: true, file, text, tables };
  } catch (err) {
    return { ok: false, error: err?.message ?? "Schema file could not be read" };
  }
}

const HEALTH_TABLE = "dbo.pos_connection_health";

/**
 * Proves the till's OWN pool — the same connection sales use — can write.
 *
 * A row is inserted inside an explicit transaction, read back, and the whole
 * thing is rolled back, so no customer or sales data is touched and nothing is
 * left behind. When the health table is absent it is created inside the same
 * transaction (and rolled back with it), which additionally proves the login
 * is not read-only.
 */
async function verifyWrite() {
  if (!pool) {
    return { ok: false, code: "ENOTCONNECTED", error: "Local database is not connected." };
  }
  const started = Date.now();
  const marker = `pos-write-check-${Date.now()}`;
  try {
    const existing = await pool
      .request()
      .query(`SELECT OBJECT_ID('${HEALTH_TABLE}', 'U') AS id`);
    const hasTable = existing.recordset[0]?.id != null;
    const create = hasTable
      ? ""
      : `CREATE TABLE ${HEALTH_TABLE} (
           id uniqueidentifier NOT NULL DEFAULT NEWID(),
           note nvarchar(128) NULL,
           checked_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
         );\n`;
    const res = await pool.request().batch(
      `SET NOCOUNT ON;
       SET XACT_ABORT ON;
       BEGIN TRAN;
       ${create}INSERT INTO ${HEALTH_TABLE} (note) VALUES ('${marker}');
       SELECT COUNT(*) AS written, DB_NAME() AS activeDb
         FROM ${HEALTH_TABLE} WHERE note = '${marker}';
       ROLLBACK;`,
    );
    const row = res.recordset?.[0] ?? {};
    if (!Number(row.written)) {
      return {
        ok: false,
        code: "EWRITEBACK",
        error: "The probe row was written but could not be read back.",
        hint: "The login can insert but not select in this database. Check its role membership.",
        latencyMs: Date.now() - started,
      };
    }
    return {
      ok: true,
      activeDb: row.activeDb ?? activeConfig?.database ?? null,
      createdProbeTable: !hasTable,
      rolledBack: true,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    const described = describeSqlError(err);
    const text = `${described.code ?? ""} ${described.error ?? ""}`.toLowerCase();
    return {
      ok: false,
      ...described,
      latencyMs: Date.now() - started,
      hint: /permission|denied|read.only/.test(text)
        ? "The sign-in works but this login cannot write to that database. Grant it db_datawriter (and db_ddladmin to create the schema), or apply the master schema from Local database settings."
        : described.hint,
    };
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
  installedOdbcDrivers,
  logConnection,
  sql,
  connect,
  close,
  getPool,
  getConfig,
  test,
  verify,
  verifyWrite,
  applySchema,
  applySchemaNow,
  readSchema,
  schemaFile,
  describeSqlError,
  parseServerField,
  openConnection,
  resolveTarget,
  parseOdbcRegistry,
};