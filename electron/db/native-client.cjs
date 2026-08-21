/**
 * Main-process supervisor for the isolated Windows Authentication driver.
 *
 * Responsibilities that must NOT live in the driver process, because a stuck
 * native call cannot run any JavaScript of its own:
 *
 *  - deadlines, and cancellation by terminating the process (the only method
 *    that actually works against a hung ODBC `connect()`);
 *  - attempt identity, so a late reply from a reaped attempt is discarded
 *    rather than applied to app state;
 *  - a consecutive-crash counter per target, so a deterministic fault cannot
 *    retry for ever;
 *  - accounting for sessions orphaned by a kill, and closing them from a side
 *    channel when the login is allowed to;
 *  - a warm worker that is reused, and a hard cap on how many may exist.
 *
 * This module never loads `mssql/msnodesqlv8`.
 */
const path = require("node:path");
const { fork } = require("node:child_process");

const {
  OPS,
  EDRIVER_CRASH,
  EDRIVER_CRASH_LOOP,
  ETIMEOUT,
  encodeValue,
  decodeValue,
  encodeType,
  decodeError,
} = require("./native-protocol.cjs");

const WORKER_ENTRY = path.join(__dirname, "native-worker-entry.cjs");

/** More than this many driver processes at once is always a retry storm. */
const MAX_WORKERS = 2;
/** A warm worker is discarded once it has been idle this long. */
const IDLE_LIFETIME_MS = 5 * 60_000;
/** Consecutive crashes on one target before automatic retry is abandoned. */
const CRASH_LIMIT = 3;
/** Orphaned sessions tolerated before the operator is warned. */
const ORPHAN_WARN_AT = 3;

let log = () => {};
/** Injected by pool.cjs so every driver event lands in `connection.log`. */
function setLogger(fn) {
  if (typeof fn === "function") log = fn;
}

/* ---------------------------- crash bookkeeping ---------------------------- */

/** target -> { crashes, lastCode, blocked } */
const crashState = new Map();

const targetKey = (target) => String(target || "unknown").toLowerCase();

function noteCrash(target) {
  const key = targetKey(target);
  const entry = crashState.get(key) ?? { crashes: 0, blocked: false };
  entry.crashes += 1;
  entry.blocked = entry.crashes >= CRASH_LIMIT;
  crashState.set(key, entry);
  log("driver.crash", { target, consecutive: entry.crashes, blocked: entry.blocked });
  return entry;
}

/** Any outcome that is not a crash clears the streak. */
function noteHealthy(target) {
  const key = targetKey(target);
  if (crashState.has(key)) crashState.delete(key);
}

function isCrashBlocked(target) {
  return crashState.get(targetKey(target))?.blocked === true;
}

function crashCount(target) {
  return crashState.get(targetKey(target))?.crashes ?? 0;
}

function resetCrashState(target) {
  if (target) crashState.delete(targetKey(target));
  else crashState.clear();
}

/* --------------------------- session bookkeeping --------------------------- */

/** Sessions we terminated without a TDS logout, oldest first. */
const orphanedSessions = [];

function sessionReport() {
  return {
    orphaned: orphanedSessions.length,
    unresolved: orphanedSessions.filter((s) => !s.cleaned).length,
    warn: orphanedSessions.filter((s) => !s.cleaned).length >= ORPHAN_WARN_AT,
    entries: orphanedSessions.slice(-10),
  };
}

function forgetSessions() {
  orphanedSessions.length = 0;
}

/* -------------------------------- transport -------------------------------- */

let seq = 0;
const nextId = () => `m${(++seq).toString(36)}`;

class Worker {
  constructor() {
    this.child = fork(WORKER_ENTRY, [], {
      // Electron's own binary in plain Node mode: no extra runtime to ship.
      execPath: process.execPath,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true,
    });
    this.pending = new Map();
    this.busy = false;
    this.dead = false;
    this.spid = null;
    this.target = null;
    this.connected = false;
    this.idleTimer = null;

    this.child.on("message", (msg) => this.#onMessage(msg));
    this.child.on("exit", (code, signal) => this.#onExit(code, signal));
    this.child.on("error", () => this.#onExit(null, "error"));
    this.child.stderr?.on("data", (chunk) => {
      log("driver.stderr", { text: String(chunk).slice(0, 300) });
    });
  }

  get pid() {
    return this.child?.pid ?? null;
  }

  #onMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.fatal) {
      log("driver.fatal", { code: msg.error?.code ?? null });
      return;
    }
    const entry = this.pending.get(msg.id);
    if (!entry) {
      // A reply for an attempt that was already timed out or reaped. It is
      // deliberately dropped: nothing downstream may act on it.
      log("driver.reply-discarded", { attemptId: msg.attemptId ?? null });
      return;
    }
    this.pending.delete(msg.id);
    clearTimeout(entry.timer);
    if (msg.ok) entry.resolve(msg.result);
    else entry.reject(decodeError(msg.error));
  }

  #onExit(code, signal) {
    if (this.dead) return;
    this.dead = true;
    this.connected = false;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const pendingCount = this.pending.size;
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      const err = new Error(
        "The database driver process stopped unexpectedly. The till is still running; the connection can be retried.",
      );
      err.code = EDRIVER_CRASH;
      err.exitCode = code ?? null;
      err.signal = signal ?? null;
      entry.reject(err);
    }
    this.pending.clear();
    log("driver.exit", { pid: this.pid, code, signal, pendingCount });
    release(this);
  }

  /**
   * Sends one operation. Rejecting on the deadline is not enough on its own —
   * the caller must terminate this worker, because the native call underneath
   * is still running and nothing may reuse it.
   */
  send(op, payload, { attemptId, timeoutMs }) {
    if (this.dead) {
      const err = new Error("The database driver process is no longer running.");
      err.code = EDRIVER_CRASH;
      return Promise.reject(err);
    }
    const id = nextId();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const err = new Error("The database driver did not answer before the deadline.");
        err.code = ETIMEOUT;
        err.timedOut = true;
        reject(err);
      }, Math.max(1_000, Number(timeoutMs) || 15_000));
      this.pending.set(id, { resolve, reject, timer, attemptId });
      try {
        this.child.send({ id, attemptId, op, payload });
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        const e = new Error("The database driver process could not be reached.");
        e.code = EDRIVER_CRASH;
        e.cause = err;
        reject(e);
      }
    });
  }

  /**
   * Termination is the cancellation primitive. Nothing calls `close()` on a
   * connection whose native `connect()` may still be in flight.
   */
  kill(reason) {
    if (this.dead) return;
    log("driver.kill", { pid: this.pid, reason: reason ?? null, spid: this.spid ?? null });
    if (this.connected && this.spid) {
      orphanedSessions.push({
        spid: this.spid,
        target: this.target,
        at: new Date().toISOString(),
        reason: reason ?? null,
        cleaned: false,
      });
    }
    try {
      this.child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
    this.#onExit(null, "SIGKILL");
  }

  touch() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (!this.busy && !this.connected) this.kill("idle");
    }, IDLE_LIFETIME_MS);
  }
}

/* ------------------------------- worker pool ------------------------------- */

/** Every live worker; capped so a burst of retries cannot flood the machine. */
const workers = new Set();
/** The single reusable worker that is not currently serving an attempt. */
let warm = null;
/** Callers waiting for a slot when the cap is reached. */
const waiting = [];

function release(worker) {
  workers.delete(worker);
  if (warm === worker) warm = null;
  const next = waiting.shift();
  if (next) next();
}

async function acquireWorker() {
  if (warm && !warm.dead) {
    const reused = warm;
    warm = null;
    reused.busy = true;
    log("driver.reuse", { pid: reused.pid });
    return reused;
  }
  while (workers.size >= MAX_WORKERS) {
    await new Promise((resolve) => waiting.push(resolve));
  }
  const worker = new Worker();
  worker.busy = true;
  workers.add(worker);
  log("driver.spawn", { pid: worker.pid, live: workers.size });
  return worker;
}

/** Hands a healthy worker back for reuse; a spent one is simply dropped. */
function parkWorker(worker) {
  if (!worker || worker.dead) return;
  worker.busy = false;
  worker.touch();
  if (!warm) warm = worker;
  else if (!worker.connected) worker.kill("surplus");
}

/** The worker that currently owns the operational connection, if any. */
let operational = null;

/* ----------------------------- session cleanup ----------------------------- */

/**
 * Closes a session left behind by a kill.
 *
 * Best effort by design: the login may not hold ALTER ANY CONNECTION. When it
 * cannot be closed, the event stays on the record so repeated retries surface
 * as a warning instead of quietly exhausting the instance's connections.
 */
async function cleanupOrphanedSessions(driverConfig) {
  const outstanding = orphanedSessions.filter((s) => !s.cleaned);
  if (!outstanding.length || !driverConfig) return sessionReport();
  let worker = null;
  try {
    worker = await acquireWorker();
    for (const entry of outstanding) {
      try {
        await worker.send(
          OPS.KILL_SESSION,
          { driverConfig, spid: entry.spid },
          { attemptId: "cleanup", timeoutMs: 8_000 },
        );
        entry.cleaned = true;
        log("driver.session-cleaned", { spid: entry.spid });
      } catch (err) {
        log("driver.session-cleanup-failed", { spid: entry.spid, code: err?.code ?? null });
        break;
      }
    }
  } catch {
    /* no slot free; the warning below still fires */
  } finally {
    if (worker) parkWorker(worker);
  }
  const report = sessionReport();
  if (report.warn) {
    log("driver.session-leak-warning", { unresolved: report.unresolved });
  }
  return report;
}

/* ------------------------------- pool facade ------------------------------- */

/** Rebuilds the recordset shape callers already expect from `mssql`. */
function reviveResult(payload) {
  const dateColumns = new Set(
    (payload.columns ?? [])
      .filter((c) => /date|time/i.test(String(c.type ?? "")))
      .map((c) => c.name),
  );
  const rows = (payload.recordset ?? []).map((row) => {
    const out = {};
    for (const [key, value] of Object.entries(row)) {
      const decoded = decodeValue(value);
      out[key] =
        dateColumns.has(key) && typeof decoded === "string" ? new Date(decoded) : decoded;
    }
    return out;
  });
  // `recordset.columns` is read by the database explorer.
  Object.defineProperty(rows, "columns", {
    value: Object.fromEntries((payload.columns ?? []).map((c) => [c.name, { name: c.name }])),
    enumerable: false,
  });
  return { recordset: rows, recordsets: [rows], rowsAffected: payload.rowsAffected ?? [] };
}

/** Default ceiling for a statement executed through the driver process. */
const QUERY_TIMEOUT_MS = 60_000;

class NativeRequest {
  constructor(owner, handle) {
    this.owner = owner;
    this.handle = handle ?? "pool";
    this.inputs = [];
  }

  /** Mirrors `request.input(name, type, value)` and `request.input(name, value)`. */
  input(name, typeOrValue, maybeValue) {
    const hasType = arguments.length >= 3;
    this.inputs.push({
      name: String(name),
      type: hasType ? encodeType(typeOrValue) : null,
      value: encodeValue(hasType ? maybeValue : typeOrValue),
    });
    return this;
  }

  query(text) {
    return this.owner.execute(this.handle, text, this.inputs, "query");
  }

  batch(text) {
    return this.owner.execute(this.handle, text, this.inputs, "batch");
  }
}

class NativeTransaction {
  constructor(pool) {
    this.pool = pool;
    this.handle = null;
  }

  async begin() {
    const res = await this.pool.send(OPS.BEGIN, {}, QUERY_TIMEOUT_MS);
    this.handle = res.handle;
    return this;
  }

  async commit() {
    if (!this.handle) return;
    const handle = this.handle;
    this.handle = null;
    await this.pool.send(OPS.COMMIT, { handle }, QUERY_TIMEOUT_MS);
  }

  async rollback() {
    if (!this.handle) return;
    const handle = this.handle;
    this.handle = null;
    await this.pool.send(OPS.ROLLBACK, { handle }, QUERY_TIMEOUT_MS);
  }

  request() {
    return new NativeRequest(this.pool, this.handle);
  }
}

/**
 * Stands in for an `mssql.ConnectionPool` while every native call actually
 * happens in another process. Callers keep the shape they already use:
 * `.request().input(...).query(...)`, `new sql.Transaction(pool)`, `.close()`.
 */
class NativePool {
  constructor(worker, { target, driverConfig }) {
    this.worker = worker;
    this.target = target;
    this.driverConfig = driverConfig;
    this.closed = false;
  }

  get connected() {
    return !this.closed && !!this.worker && !this.worker.dead;
  }

  request() {
    return new NativeRequest(this, "pool");
  }

  transaction() {
    return new NativeTransaction(this);
  }

  /** No-op: the facade never emits driver events of its own. */
  on() {
    return this;
  }

  async send(op, payload, timeoutMs) {
    if (this.closed || !this.worker || this.worker.dead) {
      const err = new Error("Local database is not connected");
      err.code = this.worker?.dead ? EDRIVER_CRASH : "ENOTCONNECTED";
      throw err;
    }
    try {
      return await this.worker.send(op, payload, {
        attemptId: this.target,
        timeoutMs: timeoutMs ?? QUERY_TIMEOUT_MS,
      });
    } catch (err) {
      if (err?.code === ETIMEOUT) {
        // The statement is still running natively; the process must go.
        this.worker.kill("statement-timeout");
        this.closed = true;
      }
      if (err?.code === EDRIVER_CRASH) {
        noteCrash(this.target);
        this.closed = true;
      }
      throw err;
    }
  }

  async execute(handle, text, inputs, mode) {
    const payload = await this.send(OPS.QUERY, { handle, text, inputs, mode }, QUERY_TIMEOUT_MS);
    return reviveResult(payload);
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    const worker = this.worker;
    this.worker = null;
    if (!worker || worker.dead) return;
    if (operational === worker) operational = null;
    try {
      await worker.send(OPS.CLOSE, {}, 5_000);
      worker.connected = false;
      worker.spid = null;
      parkWorker(worker);
    } catch {
      // A close that does not answer means the native side is wedged: kill it
      // rather than leave a half-open connection behind.
      worker.kill("close-timeout");
    }
  }
}

const isNativePool = (value) => value instanceof NativePool;

/* --------------------------------- opening -------------------------------- */

/**
 * One Windows-authentication connection attempt, fully isolated.
 *
 * `target` is the canonical direct target string, and it is what the crash
 * counter is keyed on, so a bad connection string cannot loop for ever.
 */
async function openNative({ driverConfig, target, attemptId, timeoutMs, isCancelled }) {
  if (isCrashBlocked(target)) {
    const err = new Error(
      `The database driver stopped unexpectedly ${crashCount(target)} times in a row while connecting to ${target}. Automatic retrying has been stopped. Check the ODBC driver version and the server name, then retry manually.`,
    );
    err.code = EDRIVER_CRASH_LOOP;
    throw err;
  }
  const worker = await acquireWorker();
  worker.target = target;
  const started = Date.now();
  log("driver.open", { attemptId, target, pid: worker.pid });
  try {
    const result = await worker.send(
      OPS.OPEN,
      { driverConfig },
      { attemptId, timeoutMs: Math.max(2_000, Number(timeoutMs) || 15_000) },
    );
    if (typeof isCancelled === "function" && isCancelled()) {
      worker.connected = true;
      worker.spid = result?.spid ?? null;
      worker.kill("cancelled");
      const err = new Error("The connection attempt was cancelled.");
      err.code = "ECANCELLED";
      throw err;
    }
    worker.connected = true;
    worker.spid = result?.spid ?? null;
    operational = worker;
    noteHealthy(target);
    log("driver.open-ok", { attemptId, target, elapsedMs: Date.now() - started });
    return new NativePool(worker, { target, driverConfig });
  } catch (err) {
    if (err?.code === ETIMEOUT || err?.code === "ECANCELLED") {
      // The native connect is still running. Terminating the process is the
      // only way to stop it, and it is safe: nothing else lives in there.
      worker.kill(err.code === ETIMEOUT ? "handshake-timeout" : "cancelled");
      void cleanupOrphanedSessions(driverConfig);
    } else if (err?.code === EDRIVER_CRASH) {
      noteCrash(target);
    } else {
      // A refused login or a missing driver is a clean answer, not a crash.
      noteHealthy(target);
      parkWorker(worker);
    }
    throw err;
  }
}

/** Terminates every driver process — app shutdown, or connection removal. */
function shutdown(reason) {
  warm = null;
  operational = null;
  for (const worker of [...workers]) worker.kill(reason ?? "shutdown");
  workers.clear();
}

function diagnostics() {
  return {
    workers: workers.size,
    maxWorkers: MAX_WORKERS,
    warm: !!warm,
    sessions: sessionReport(),
    crashTargets: [...crashState.entries()].map(([target, state]) => ({ target, ...state })),
  };
}

module.exports = {
  NativePool,
  NativeRequest,
  NativeTransaction,
  isNativePool,
  openNative,
  shutdown,
  diagnostics,
  setLogger,
  cleanupOrphanedSessions,
  sessionReport,
  forgetSessions,
  isCrashBlocked,
  crashCount,
  noteCrash,
  noteHealthy,
  resetCrashState,
  CRASH_LIMIT,
  MAX_WORKERS,
  EDRIVER_CRASH,
  EDRIVER_CRASH_LOOP,
};
