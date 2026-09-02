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
 * Windows integrated authentication runs in an isolated driver process.
 *
 * `mssql/msnodesqlv8` is a native ODBC binding: a stuck or faulting connect
 * cannot be interrupted from JavaScript, and closing the pool underneath it
 * used to take the whole till down. It is therefore never loaded here — the
 * supervisor below owns a separate process, and cancellation means killing it.
 */
const native = require("./native-client.cjs");
native.setLogger((event, detail) => logConnection(event, detail));


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
 * Target parsing lives in `sql-target.cjs` so the probe, the handshake, the
 * lock step and the operational pool cannot disagree about where to connect.
 */
const {
  parseServerField,
  normalizeDirectTarget,
  auditConnectionConfig,
} = require("./sql-target.cjs");


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
    EDRIVER_CRASH:
      "The isolated database driver process stopped unexpectedly. The till itself was not affected — retry the connection.",
    EDRIVER_CRASH_LOOP:
      "The database driver crashed repeatedly against this server, so automatic retrying was stopped. Check the ODBC driver version and the server name, then retry manually.",
  };
  const text = `${code ?? ""} ${message} ${originalMessage ?? ""}`.toLowerCase();
  const stage =
    code === "EDRIVER_CRASH" || code === "EDRIVER_CRASH_LOOP"
      ? "driver"
      : code === "EDRIVER" || code === "EBUDGET" || /im002|driver.*not found|data source name not found/.test(text)
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
 * `Transaction` and `Request` must follow the pool they are given.
 *
 * A Windows-auth pool is a facade over another process, so `new
 * sql.Transaction(pool)` has to produce the facade transaction; a SQL-login
 * pool is a real tedious object and keeps the real class. Returning an object
 * from the constructor lets every existing call site stay exactly as it is.
 */
function dispatchingClass(makeNative, name) {
  return class {
    constructor(owner) {
      if (native.isNativePool(owner) || owner instanceof native.NativeTransaction) {
        return makeNative(owner);
      }
      const Real = Reflect.get(loadDriver(), name);
      return new Real(owner);
    }
  };
}

const NativeRequestFor = (owner) =>
  owner instanceof native.NativeTransaction
    ? new native.NativeRequest(owner.pool, owner.handle)
    : new native.NativeRequest(owner, "pool");


/**
 * Lazy stand-in for the mssql namespace: `sql.Int`, `new sql.Transaction(...)`
 * etc. keep working, but the module is only required when actually touched.
 * The type constructors come from the pure-JavaScript build in every case —
 * they are metadata, never a live driver connection.
 */
const sql = new Proxy(
  {},
  {
    get: (_t, prop) => {
      if (prop === "Transaction") {
        return dispatchingClass((owner) => new native.NativeTransaction(owner), "Transaction");
      }
      if (prop === "Request") return dispatchingClass(NativeRequestFor, "Request");

      return Reflect.get(loadDriver(), prop);
    },
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
  // Direct mode: the operator gave a real port, so the instance name is only
  // decoration. One canonical `host,port` target, and never UDP 1434.
  if (isDirectConnect(config)) {
    const target = normalizeDirectTarget(config);
    logConnection("target.direct", {
      host: target.host,
      port: target.port,
      droppedInstanceName: target.droppedInstanceName,
      browserUsed: false,
    });
    return target;
  }

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

  const useNative = config.auth === "windows" && requireWindowsDriver();
  const odbc = useNative ? detectOdbcDrivers() : { drivers: [null], detected: true };
  const drivers = odbc.drivers;
  if (config.auth === "windows" && !useNative && !config.user) {
    const e = new Error(WINDOWS_AUTH_HINT);
    e.code = "EDRIVER";
    throw e;
  }
  if (useNative && !drivers.length) {
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
          native: useNative,
          odbcDriver,
          driverConfig: useNative
            ? nativeConfig(config, target, sec, byPort, odbcDriver)
            : tediousConfig(config, target, sec, byPort),
          label: `${
            byPort
              ? `${target.host},${target.port}`
              : `${target.host}\\${target.instanceName}`
          } · ${config.auth === "windows" ? "Windows" : `SQL login ${config.user ?? ""}`} · ${
            useNative ? odbcDriver : "tedious"
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
    drivers: useNative ? drivers : ["tedious"],
    odbcDetected: odbc.detected,
    routes: routes.map((byPort) => (byPort ? "port" : "instance")),
    browserUsed: target.browserAnswered === true,
  });
  return { target, attempts, useNative };
}

/**
 * Opens a pool, walking the attempt ladder. The winning combination and every
 * failed attempt come back with the result so the UI can explain itself.
 */
async function openConnection(config) {
  const { attempts, target, useNative } = await planAttempts(config);
  // One canonical string, shared by the crash counter and every log line.
  const targetKey = `${target.host},${target.port}`;
  const tried = [];
  let lastError = null;
  const defaultBudget = isDirectConnect(config) ? DIRECT_BUDGET_MS : LADDER_BUDGET_MS;
  const budget = Number(config.budgetMs) > 0 ? Number(config.budgetMs) : defaultBudget;

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
    logConnection("attempt.start", {
      label: attempt.label,
      remainingMs: remaining,
      isolated: attempt.native === true,
    });
    try {
      let opened;
      if (attempt.native) {
        // Windows authentication never runs in this process. The supervisor
        // owns the deadline AND the cancellation, because the only way to stop
        // a wedged native connect is to terminate the process running it.
        opened = await native.openNative({
          driverConfig: attempt.driverConfig,
          target: targetKey,
          attemptId: config.attemptId ?? targetKey,
          timeoutMs: attemptTimeoutOf(config, remaining),
          isCancelled: config.isCancelled,
        });
      } else {
        const mssql = loadDriver();
        opening = new mssql.ConnectionPool(attempt.driverConfig);
        // Unhandled 'error' events on a pool we are about to drop must not
        // crash the main process.
        opening.on("error", () => {});
        opened = await withDeadline(
          opening.connect(),
          attemptTimeoutOf(config, remaining),
          "ETIMEOUT",
          "The sign-in did not complete before the deadline.",
        );
      }
      logConnection("attempt.ok", { label: attempt.label, elapsedMs: Date.now() - startedAt });
      return {
        pool: opened,
        attempt: {
          label: attempt.label,
          host: target.host,
          port: attempt.byPort ? target.port : null,
          instanceName: target.instanceName || null,
          usedPort: attempt.byPort,
          driver: attempt.native ? attempt.odbcDriver : "tedious",
          isolated: attempt.native === true,
          browserUsed: target.browserAnswered === true,
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
      // A deterministic driver crash must not be walked around the ladder:
      // every remaining combination would crash the same way.
      if (err?.code === "EDRIVER_CRASH_LOOP") break;
      if (attempt.native) {
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

/* ================= schema manifest (per-table view of schema.sql) ================= */

/**
 * Columns the sync engine adds itself through cursor batches, to every table
 * that carries is_synced / sync_status. They never appear in a CREATE TABLE
 * block, so the comparison must not report them as unexpected extras.
 */
const ENGINE_SYNC_COLUMNS = new Set([
  "synced_at",
  "pending_sync",
  "temp_id",
  "sync_error",
  "sync_attempts",
  "last_error_at",
  "row_version",
]);

const TYPE_PATTERN =
  "(?:UNIQUEIDENTIFIER|N?VARCHAR\\s*\\([^)]*\\)|N?CHAR\\s*\\([^)]*\\)|" +
  "DECIMAL\\s*\\([^)]*\\)|NUMERIC\\s*\\([^)]*\\)|DATETIME2\\s*\\([^)]*\\)|" +
  "DATETIME|SMALLDATETIME|DATE|TIME|BIGINT|SMALLINT|TINYINT|INT|BIT|" +
  "FLOAT|REAL|MONEY|VARBINARY\\s*\\([^)]*\\)|BINARY\\s*\\([^)]*\\)|XML)";

const SKIP_COLUMN_WORDS = new Set([
  "CONSTRAINT",
  "PRIMARY",
  "FOREIGN",
  "UNIQUE",
  "CHECK",
  "REFERENCES",
]);

/** Removes block and line comments so statement detection is never fooled. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
}

/** Splits on GO separators, keeping indexes aligned with the original text. */
function splitBatches(text) {
  return text.split(/^\s*GO\s*$/gim);
}

const normalizeType = (raw) => raw.replace(/\s+/g, "").toUpperCase();

/**
 * Parses the master schema file into a per-table manifest. Because the list
 * is derived from the file itself, any table added to schema.sql in a future
 * update shows up automatically — nothing here is hard-coded.
 *
 * Batch assignment: a batch that references exactly one known table belongs
 * to it; engine-wide cursor batches and multi-table guarded batches are
 * "shared" and run with every apply (they are all idempotent).
 */
function parseSchemaManifest(text) {
  const clean = stripComments(text);
  const cleanBatches = splitBatches(clean);
  const rawBatches = splitBatches(text);

  // Pass 1 — every table and the batch that creates it.
  const tables = new Map(); // lower -> { name, createIdx, columns: Map, batchIdx: [] }
  const warnings = [];
  const createRe = /CREATE\s+TABLE\s+dbo\.\[?([A-Za-z_]\w*)\]?/gi;
  cleanBatches.forEach((batch, i) => {
    createRe.lastIndex = 0;
    let m;
    while ((m = createRe.exec(batch))) {
      const key = m[1].toLowerCase();
      if (!tables.has(key)) {
        tables.set(key, { name: m[1], createIdx: i, columns: new Map(), batchIdx: [] });
      }
    }
  });

  // Pass 2 — assign each batch to its table, or to the shared set. Dynamic
  // references such as dbo.[' + @t never match the word pattern, so cursor
  // batches land in shared automatically.
  const refRe = /dbo\.\[?([A-Za-z_]\w*)\]?/gi;
  const sharedIdx = [];
  cleanBatches.forEach((batch, i) => {
    if (!batch.trim()) return;
    refRe.lastIndex = 0;
    const refs = new Set();
    let m;
    while ((m = refRe.exec(batch))) {
      const key = m[1].toLowerCase();
      if (tables.has(key)) refs.add(key);
    }
    if (refs.size === 1) tables.get([...refs][0]).batchIdx.push(i);
    else sharedIdx.push(i);
  });

  // Pass 3 — columns from the CREATE TABLE body plus guarded ALTER … ADD
  // statements that belong to the table.
  const colTypeRe = new RegExp(`^\\s*\\[?([A-Za-z_]\\w*)\\]?\\s+(${TYPE_PATTERN})`, "i");
  const addRe = new RegExp(
    `\\bADD\\s+(?:COLUMN\\s+)?\\[?([A-Za-z_]\\w*)\\]?\\s+(${TYPE_PATTERN})`,
    "gi",
  );
  for (const t of tables.values()) {
    const createBatch = cleanBatches[t.createIdx] ?? "";
    createRe.lastIndex = 0;
    const createMatch = createRe.exec(createBatch);
    const open = createMatch ? createBatch.indexOf("(", createMatch.index + createMatch[0].length) : -1;
    const close = createBatch.lastIndexOf(")");
    if (open !== -1 && close > open) {
      for (const line of createBatch.slice(open + 1, close).split("\n")) {
        const m = colTypeRe.exec(line);
        if (!m) {
          const candidate = line.trim().match(/^\[?([A-Za-z_]\w*)\]?\s+([A-Za-z][A-Za-z0-9_]*)/);
          if (candidate && !SKIP_COLUMN_WORDS.has(candidate[1].toUpperCase())) {
            warnings.push(
              `${t.name}.${candidate[1]} uses an unsupported manifest type (${candidate[2]}).`,
            );
          }
          continue;
        }
        if (SKIP_COLUMN_WORDS.has(m[1].toUpperCase())) continue;
        const key = m[1].toLowerCase();
        if (!t.columns.has(key)) t.columns.set(key, { name: m[1], type: normalizeType(m[2]) });
      }
    }
    for (const idx of t.batchIdx) {
      const batch = cleanBatches[idx] ?? "";
      addRe.lastIndex = 0;
      let m;
      while ((m = addRe.exec(batch))) {
        const key = m[1].toLowerCase();
        if (!t.columns.has(key)) t.columns.set(key, { name: m[1], type: normalizeType(m[2]) });
      }
    }
  }

  return {
    tables: [...tables.values()].map((t) => ({
      name: t.name,
      key: t.name.toLowerCase(),
      columns: [...t.columns.values()],
    })),
    sharedIdx,
    tableBatches: new Map([...tables.entries()].map(([k, t]) => [k, t.batchIdx])),
    rawBatches,
    warnings,
  };
}

/**
 * Live comparison of the master file against the connected database. Without
 * a connection it still returns the manifest (exists/present = null) so the
 * panel can show what the file defines.
 */
async function schemaStatus() {
  const file = schemaFile();
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    return { ok: false, error: err?.message ?? "Schema file could not be read" };
  }
  const manifest = parseSchemaManifest(text);

  if (!pool) {
    return {
      ok: true,
      connected: false,
      file,
      text,
      tables: manifest.tables.map((t) => ({
        name: t.name,
        exists: null,
        columns: t.columns.map((c) => ({ ...c, present: null })),
        missingColumns: [],
        extraColumns: [],
        columnCount: null,
      })),
      unknownTables: [],
      warnings: manifest.warnings,
    };
  }

  const res = await pool
    .request()
    .query(
      `SELECT t.name AS tableName, c.name AS columnName
         FROM sys.tables t
         LEFT JOIN sys.columns c ON c.object_id = t.object_id
        WHERE SCHEMA_NAME(t.schema_id) = N'dbo'`,
    );
  const actual = new Map(); // lower table -> Set of lower columns
  for (const row of res.recordset) {
    const key = String(row.tableName).toLowerCase();
    if (!actual.has(key)) actual.set(key, new Set());
    if (row.columnName) actual.get(key).add(String(row.columnName).toLowerCase());
  }

  const known = new Set(manifest.tables.map((t) => t.key));
  const tables = manifest.tables.map((t) => {
    const have = actual.get(t.key);
    const exists = have != null;
    const expected = new Set(t.columns.map((c) => c.name.toLowerCase()));
    return {
      name: t.name,
      exists,
      columns: t.columns.map((c) => ({
        ...c,
        present: exists ? have.has(c.name.toLowerCase()) : null,
      })),
      missingColumns: exists
        ? t.columns.filter((c) => !have.has(c.name.toLowerCase())).map((c) => c.name)
        : [],
      extraColumns: exists
        ? [...have].filter((c) => !expected.has(c) && !ENGINE_SYNC_COLUMNS.has(c))
        : [],
      columnCount: exists ? have.size : null,
    };
  });
  const unknownTables = [...actual.keys()].filter((k) => !known.has(k)).sort();
  return {
    ok: true,
    connected: true,
    file,
    text,
    tables,
    unknownTables,
    warnings: manifest.warnings,
  };
}

/**
 * Deep, read-only inventory of the local SQL Server database: columns with
 * nullability and default, primary keys, foreign keys, unique/check
 * constraints, indexes and triggers. Nothing is modified.
 */
async function schemaInventory() {
  if (!pool) return { ok: true, connected: false, tables: {} };
  const q = async (sql) => (await pool.request().query(sql)).recordset;
  const tables = {};
  const bucket = (name) => {
    const key = String(name).toLowerCase();
    if (!tables[key]) {
      tables[key] = {
        columns: {},
        primaryKey: [],
        foreignKeys: [],
        constraints: [],
        indexes: [],
        triggers: [],
      };
    }
    return tables[key];
  };

  for (const r of await q(
    `SELECT t.name AS tbl, c.name AS col, TYPE_NAME(c.user_type_id) AS typ,
            c.is_nullable AS nullable, dc.definition AS dflt
       FROM sys.tables t
       JOIN sys.columns c ON c.object_id = t.object_id
       LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = t.object_id
            AND dc.parent_column_id = c.column_id
      WHERE SCHEMA_NAME(t.schema_id) = N'dbo'`,
  )) {
    bucket(r.tbl).columns[String(r.col).toLowerCase()] = {
      type: r.typ ?? null,
      nullable: r.nullable === true || r.nullable === 1,
      default: r.dflt ?? null,
    };
  }
  for (const r of await q(
    `SELECT t.name AS tbl, i.name AS idx, i.is_primary_key AS pk, i.is_unique AS uq
       FROM sys.indexes i JOIN sys.tables t ON t.object_id = i.object_id
      WHERE SCHEMA_NAME(t.schema_id) = N'dbo' AND i.name IS NOT NULL`,
  )) {
    const b = bucket(r.tbl);
    b.indexes.push(String(r.idx).toLowerCase());
    if (r.pk === true || r.pk === 1) b.primaryKey.push(String(r.idx).toLowerCase());
    if (r.uq === true || r.uq === 1) b.constraints.push(String(r.idx).toLowerCase());
  }
  for (const r of await q(
    `SELECT t.name AS tbl, fk.name AS nm FROM sys.foreign_keys fk
       JOIN sys.tables t ON t.object_id = fk.parent_object_id
      WHERE SCHEMA_NAME(t.schema_id) = N'dbo'`,
  )) {
    bucket(r.tbl).foreignKeys.push(String(r.nm).toLowerCase());
  }
  for (const r of await q(
    `SELECT t.name AS tbl, cc.name AS nm FROM sys.check_constraints cc
       JOIN sys.tables t ON t.object_id = cc.parent_object_id
      WHERE SCHEMA_NAME(t.schema_id) = N'dbo'`,
  )) {
    bucket(r.tbl).constraints.push(String(r.nm).toLowerCase());
  }
  for (const r of await q(
    `SELECT t.name AS tbl, tr.name AS nm FROM sys.triggers tr
       JOIN sys.tables t ON t.object_id = tr.parent_id
      WHERE SCHEMA_NAME(t.schema_id) = N'dbo'`,
  )) {
    bucket(r.tbl).triggers.push(String(r.nm).toLowerCase());
  }
  return { ok: true, connected: true, tables };
}



/**
 * Applies only the batches that belong to the selected tables, plus the
 * shared engine batches (sync columns, retry bookkeeping). Every statement
 * is guarded, so re-running never drops or rewrites existing objects. A
 * failing batch is recorded and the rest still run.
 */
async function applySchemaTables(tableNames) {
  if (!pool) return { ok: false, error: "Connect to the local database first." };
  const file = schemaFile();
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    return { ok: false, error: err?.message ?? "Schema file could not be read" };
  }
  const manifest = parseSchemaManifest(text);
  const wanted = new Set(
    (Array.isArray(tableNames) ? tableNames : []).map((n) => String(n).toLowerCase()),
  );
  const unknown = [...wanted].filter((w) => !manifest.tableBatches.has(w));

  const selected = new Set(manifest.sharedIdx);
  const owner = new Map();
  for (const i of manifest.sharedIdx) owner.set(i, "shared engine rules");
  for (const [key, idxs] of manifest.tableBatches) {
    if (!wanted.has(key)) continue;
    for (const i of idxs) {
      selected.add(i);
      owner.set(i, key);
    }
  }

  const errors = [];
  let batchCount = 0;
  for (const i of [...selected].sort((a, b) => a - b)) {
    const batch = (manifest.rawBatches[i] ?? "").trim();
    if (!batch) continue;
    try {
      await pool.request().batch(batch);
      batchCount += 1;
    } catch (err) {
      errors.push({
        scope: owner.get(i) ?? "unknown",
        ...describeSqlError(err),
        permission: isDdlPermissionError(err),
      });
    }
  }
  try {
    require("./repo.cjs").forgetColumnCache();
  } catch {
    /* repo not loaded yet */
  }
  return {
    ok: errors.length === 0 && unknown.length === 0,
    applied: [...wanted].filter((w) => manifest.tableBatches.has(w)),
    unknownTables: unknown,
    batchCount,
    errors,
    permission: errors.some((e) => e.permission),
  };
}

/**
 * Builds a runnable SQL script for the chosen tables (shared engine batches
 * included, original comments preserved). Used for the in-app SQL download
 * so migration files never travel by pen drive again.
 */
function schemaTableSql(tableNames) {
  const file = schemaFile();
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    return { ok: false, error: err?.message ?? "Schema file could not be read" };
  }
  const wanted = (Array.isArray(tableNames) ? tableNames : [])
    .map((n) => String(n).toLowerCase())
    .filter(Boolean);
  if (!wanted.length) return { ok: true, file, text };

  const manifest = parseSchemaManifest(text);
  const wantedSet = new Set(wanted);
  const selected = new Set(manifest.sharedIdx);
  for (const [key, idxs] of manifest.tableBatches) {
    if (!wantedSet.has(key)) continue;
    for (const i of idxs) selected.add(i);
  }
  const names = manifest.tables.filter((t) => wantedSet.has(t.key)).map((t) => t.name);
  const body = [...selected]
    .sort((a, b) => a - b)
    .map((i) => (manifest.rawBatches[i] ?? "").trim())
    .filter(Boolean)
    .join("\nGO\n");
  const header =
    `/* POS local schema — tables: ${names.join(", ")}\n` +
    `   Extracted from database/schema.sql. Every statement is guarded:\n` +
    `   safe to run repeatedly, never drops data. */\n\n`;
  return { ok: true, file, tables: names, text: header + body + "\nGO\n" };
}

/**
 * The raw guarded batches for the chosen tables — the exact statements the
 * elevated administrator-repair channel replays. Batches only ever come from
 * the master schema file on disk, never from renderer-supplied SQL, so this
 * channel cannot be turned into an arbitrary-DDL bridge.
 */
function schemaTableBatches(tableNames) {
  const wanted = (Array.isArray(tableNames) ? tableNames : [])
    .map((n) => String(n).toLowerCase())
    .filter(Boolean);
  if (!wanted.length) return { ok: false, error: "Choose at least one table to repair." };
  const manifest = schemaManifest();
  if (!manifest) return { ok: false, error: "Master schema file could not be read." };
  const unknown = wanted.filter((w) => !manifest.tableBatches.has(w));
  const known = new Set(wanted.filter((w) => manifest.tableBatches.has(w)));
  if (!known.size) {
    return { ok: false, error: `Not in the master schema file: ${unknown.join(", ")}` };
  }
  const selected = new Set(manifest.sharedIdx);
  for (const [key, idxs] of manifest.tableBatches) {
    if (!known.has(key)) continue;
    for (const i of idxs) selected.add(i);
  }
  const batches = [...selected]
    .sort((a, b) => a - b)
    .map((i) => (manifest.rawBatches[i] ?? "").trim())
    .filter(Boolean);
  return {
    ok: unknown.length === 0 && batches.length > 0,
    batches,
    tables: manifest.tables.filter((t) => known.has(t.key)).map((t) => t.name),
    unknownTables: unknown,
    error: batches.length
      ? unknown.length
        ? `Not in the master schema file: ${unknown.join(", ")}`
        : null
      : "Nothing to repair for the chosen tables.",
  };
}

/* ================= on-demand schema self-heal ================= */

/**
 * Cached parse of database/schema.sql. Every repo operation may ask the
 * manifest whether a column is declared, so the file is re-read only when it
 * actually changes on disk.
 */
let manifestCache = null;

function schemaManifest() {
  const file = schemaFile();
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  if (manifestCache && manifestCache.file === file && manifestCache.mtimeMs === stat.mtimeMs) {
    return manifestCache.manifest;
  }
  const manifest = parseSchemaManifest(fs.readFileSync(file, "utf8"));
  manifestCache = { file, mtimeMs: stat.mtimeMs, manifest };
  return manifest;
}

/** Expected `{ name, type }` of a column per the master schema, or null. */
function schemaColumnType(table, column) {
  const manifest = schemaManifest();
  if (!manifest) return null;
  const t = manifest.tables.find((x) => x.key === String(table).toLowerCase());
  const c = t?.columns.find((x) => x.name.toLowerCase() === String(column).toLowerCase());
  return c ? { name: c.name, type: c.type } : null;
}

/** SQL Server 262/229/297 — the login may read/write but not create/alter. */
function isDdlPermissionError(err) {
  const num = err?.number ?? err?.originalError?.number ?? null;
  if (num === 262 || num === 229 || num === 297) return true;
  return /permission(\s+was)?\s+denied|denied\s+on\s+(object|database)/i.test(
    `${err?.message ?? ""} ${err?.originalError?.message ?? ""}`,
  );
}

/**
 * One repair per table/column at a time: a sale and the sync worker hitting
 * the same missing object share the run instead of racing identical ALTERs.
 */
const healInflight = new Map();

function sharedHeal(name, fn) {
  const pending = healInflight.get(name);
  if (pending) return pending;
  const run = (async () => fn())().finally(() => healInflight.delete(name));
  healInflight.set(name, run);
  return run;
}

/** Normalised manifest types only: letters, optional (n), (n,m) or (MAX). */
const SAFE_ALTER_TYPE = /^[A-Z]{2,20}\((?:\d+|MAX)(?:,\d+)?\)$|^[A-Z]{2,20}$/i;

/**
 * Adds one column to an existing table, guarded so a retry after a partial
 * failure is a no-op. Nullable on purpose: existing rows keep working.
 */
async function ensureColumn(table, column, type) {
  if (!pool) return { ok: false, error: "Local database is not connected." };
  if (!/^[A-Za-z_]\w*$/.test(table) || !/^[A-Za-z_]\w*$/.test(column)) {
    return { ok: false, error: "Invalid table or column name." };
  }
  const t = String(type ?? "").trim();
  if (!SAFE_ALTER_TYPE.test(t)) return { ok: false, error: `Unsafe column type "${type}".` };
  const key = `${table.toLowerCase()}.${column.toLowerCase()}`;
  return sharedHeal(`col:${key}`, async () => {
    try {
      await pool
        .request()
        .batch(
          `SET LOCK_TIMEOUT 4000;\n` +
            `IF COL_LENGTH('dbo.${table}', '${column}') IS NULL\n` +
            `ALTER TABLE dbo.[${table}] ADD [${column}] ${t} NULL;`,
        );
      try {
        require("./repo.cjs").forgetColumnCache();
      } catch {
        /* repo not loaded yet */
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, ...describeSqlError(err), permission: isDdlPermissionError(err) };
    }
  });
}

/**
 * Repairs exactly one table from the master schema — the shared engine
 * batches plus the table's own guarded batches. Called when an operation
 * proves the table is missing or broken, never on a schedule.
 */
async function ensureSchemaTable(table) {
  if (!pool) return { ok: false, error: "Local database is not connected." };
  const key = String(table).toLowerCase();
  return sharedHeal(`table:${key}`, async () => {
    const manifest = schemaManifest();
    if (!manifest || !manifest.tableBatches.has(key)) {
      return {
        ok: false,
        code: "EUNKNOWNTABLE",
        error: `"${table}" is not in the master schema file.`,
      };
    }
    const selected = new Set(manifest.sharedIdx);
    for (const i of manifest.tableBatches.get(key)) selected.add(i);
    const errors = [];
    for (const i of [...selected].sort((a, b) => a - b)) {
      const batch = (manifest.rawBatches[i] ?? "").trim();
      if (!batch) continue;
      try {
        await pool.request().batch(batch);
      } catch (err) {
        errors.push({
          scope: key,
          ...describeSqlError(err),
          permission: isDdlPermissionError(err),
        });
      }
    }
    try {
      require("./repo.cjs").forgetColumnCache();
    } catch {
      /* repo not loaded yet */
    }
    return {
      ok: errors.length === 0,
      errors,
      permission: errors.some((e) => e.permission),
    };
  });
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
  applySchemaTables,
  ensureSchemaTable,
  ensureColumn,
  schemaColumnType,
  isDdlPermissionError,
  readSchema,
  schemaFile,
  schemaStatus,
  schemaInventory,
  schemaTableSql,
  schemaTableBatches,
  parseSchemaManifest,
  describeSqlError,
  parseServerField,
  openConnection,
  resolveTarget,
  isDirectConnect,
  DIRECT_BUDGET_MS,
  parseOdbcRegistry,
  auditConnectionConfig,
  driverDiagnostics: () => native.diagnostics(),
  shutdownDrivers: (reason) => native.shutdown(reason),
  resetDriverCrashState: (target) => native.resetCrashState(target),
};