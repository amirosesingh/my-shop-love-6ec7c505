/**
 * Wire format between the Electron main process and the isolated Windows
 * authentication driver process.
 *
 * Every message is `{ id, attemptId, op, payload }` and every reply is
 * `{ id, attemptId, ok, result | error }`. The attempt identifier travels with
 * the message so a reply belonging to an attempt that has already been timed
 * out, stopped or reaped can be recognised and thrown away.
 *
 * Nothing in here may ever carry a credential: connection strings are built in
 * the main process and sent once, but they are never logged or echoed back.
 */

/** Driver process died or was killed while an operation was outstanding. */
const EDRIVER_CRASH = "EDRIVER_CRASH";
/** The same target crashed the driver process too many times in a row. */
const EDRIVER_CRASH_LOOP = "EDRIVER_CRASH_LOOP";
/** The native call never answered and the process had to be terminated. */
const ETIMEOUT = "ETIMEOUT";
/** The attempt was superseded or the operator pressed Stop. */
const ECANCELLED = "ECANCELLED";

const OPS = Object.freeze({
  OPEN: "open",
  QUERY: "query",
  BEGIN: "tx.begin",
  COMMIT: "tx.commit",
  ROLLBACK: "tx.rollback",
  CLOSE: "close",
  KILL_SESSION: "kill-session",
  PING: "ping",
});

/* ------------------------------ value coding ------------------------------ */

/**
 * Child-process IPC is JSON, so `Date` and `Buffer` would arrive as strings.
 * They are tagged on the way out and rebuilt on the way in.
 */
function encodeValue(value) {
  if (value instanceof Date) return { __t: "date", v: value.toISOString() };
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return { __t: "buf", v: value.toString("base64") };
  }
  return value;
}

function decodeValue(value) {
  if (value && typeof value === "object" && typeof value.__t === "string") {
    if (value.__t === "date") return new Date(value.v);
    if (value.__t === "buf") return Buffer.from(value.v, "base64");
  }
  return value;
}

/* ------------------------------- type coding ------------------------------ */

/**
 * `sql.NVarChar`, `sql.NVarChar(4000)` and `sql.Decimal(18, 4)` are all pure
 * metadata in the base (tedious) build, which is safe to load in the main
 * process. Only the description crosses the boundary; the driver process
 * rebuilds the real type from its own namespace.
 */
function encodeType(type) {
  if (type == null) return null;
  if (typeof type === "function") {
    return { name: type.declaration ?? type.name ?? null };
  }
  if (typeof type === "object") {
    const base = type.type ?? null;
    return {
      name: base?.declaration ?? base?.name ?? type.declaration ?? null,
      length: type.length ?? null,
      scale: type.scale ?? null,
      precision: type.precision ?? null,
    };
  }
  return null;
}

/** Rebuilds an mssql type from its description, inside the driver process. */
function decodeType(sqlNamespace, encoded) {
  if (!encoded || !encoded.name) return null;
  const wanted = String(encoded.name).toLowerCase();
  const types = sqlNamespace.TYPES ?? {};
  let found = null;
  for (const candidate of Object.values(types)) {
    if (String(candidate?.declaration ?? "").toLowerCase() === wanted) {
      found = candidate;
      break;
    }
  }
  if (!found) return null;
  const args = [];
  if (encoded.precision != null) {
    args.push(encoded.precision, encoded.scale ?? 0);
  } else if (encoded.length != null) {
    args.push(encoded.length);
  }
  return args.length ? found(...args) : found;
}

/* ------------------------------ error coding ------------------------------ */

/** A driver error reduced to what the UI needs, with no credential anywhere. */
function encodeError(err) {
  return {
    message: err?.message ?? String(err),
    code: err?.code ?? err?.originalError?.code ?? null,
    originalMessage:
      err?.originalError?.message ?? err?.originalError?.info?.message ?? null,
    number: err?.number ?? err?.originalError?.info?.number ?? null,
  };
}

/** Rebuilds a throwable from an encoded error so callers keep `err.code`. */
function decodeError(encoded) {
  const err = new Error(encoded?.message ?? "The database driver failed.");
  if (encoded?.code) err.code = encoded.code;
  if (encoded?.originalMessage) {
    err.originalError = { message: encoded.originalMessage, info: { number: encoded.number } };
  }
  return err;
}

/** Strips anything credential-shaped before a value reaches a log line. */
function sanitizeForLog(detail) {
  if (!detail || typeof detail !== "object") return detail;
  const out = {};
  for (const [key, value] of Object.entries(detail)) {
    if (/pass|pwd|credential|connectionstring|token|secret/i.test(key)) continue;
    out[key] = typeof value === "string" && value.length > 300 ? `${value.slice(0, 300)}…` : value;
  }
  return out;
}

module.exports = {
  OPS,
  EDRIVER_CRASH,
  EDRIVER_CRASH_LOOP,
  ETIMEOUT,
  ECANCELLED,
  encodeValue,
  decodeValue,
  encodeType,
  decodeType,
  encodeError,
  decodeError,
  sanitizeForLog,
};
