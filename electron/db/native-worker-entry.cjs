/**
 * Isolated Windows Authentication driver process.
 *
 * This is the ONLY file in the application that loads `mssql/msnodesqlv8`.
 * The native ODBC binding can hang or fault in ways JavaScript cannot
 * interrupt, so it is kept out of the process that owns the till's windows:
 * if it dies, only this process dies, and the register stays open.
 *
 * It speaks the request/response protocol in `native-protocol.cjs` over the
 * standard child-process channel. It holds no policy of its own — deadlines,
 * cancellation and retry all live in the parent, because the only reliable way
 * to cancel a stuck native call is to terminate this process.
 */
const {
  OPS,
  encodeValue,
  decodeValue,
  decodeType,
  encodeError,
} = require("./native-protocol.cjs");

let sql = null;
/** The single connection pool this process owns, if any. */
let pool = null;
/** Open transactions by handle, so a request can be routed to the right one. */
const transactions = new Map();
let txSeq = 0;

function loadDriver() {
  if (sql) return sql;
  try {
    sql = require("mssql/msnodesqlv8");
  } catch (err) {
    const e = new Error(
      "Windows authentication needs the msnodesqlv8 driver and an ODBC driver for SQL Server. Install 'ODBC Driver 18 for SQL Server' from Microsoft, or switch to a SQL Server login.",
    );
    e.code = "EDRIVER";
    e.originalError = err;
    throw e;
  }
  return sql;
}

/** Column metadata the parent needs to rebuild dates and name the columns. */
function describeColumns(recordset) {
  const columns = recordset?.columns ?? null;
  if (!columns) return [];
  return Object.entries(columns).map(([name, meta]) => ({
    name,
    type: meta?.type?.declaration ?? null,
  }));
}

function encodeResult(result) {
  const recordset = result?.recordset ?? [];
  return {
    recordset: recordset.map((row) =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k, encodeValue(v)])),
    ),
    columns: describeColumns(recordset),
    rowsAffected: result?.rowsAffected ?? [],
    recordsetCount: Array.isArray(result?.recordsets) ? result.recordsets.length : 1,
  };
}

/** Builds a request against the pool or one of its open transactions. */
function buildRequest(handle, inputs) {
  const namespace = loadDriver();
  let request;
  if (handle && handle !== "pool") {
    const tx = transactions.get(handle);
    if (!tx) {
      const e = new Error("That transaction is no longer open.");
      e.code = "ENOTX";
      throw e;
    }
    request = new namespace.Request(tx);
  } else {
    if (!pool) {
      const e = new Error("Local database is not connected");
      e.code = "ENOTCONNECTED";
      throw e;
    }
    request = pool.request();
  }
  for (const input of inputs ?? []) {
    const value = decodeValue(input.value);
    const type = decodeType(namespace, input.type);
    if (type) request.input(input.name, type, value);
    else request.input(input.name, value);
  }
  return request;
}

/**
 * The server-side session id.
 *
 * The parent records it so that, when this process has to be terminated
 * without a clean TDS logout, the orphaned session can be closed from a
 * side channel instead of sitting on the instance until it times out.
 */
async function readSpid() {
  try {
    const res = await pool.request().query("SELECT @@SPID AS spid");
    const spid = Number(res.recordset?.[0]?.spid);
    return Number.isFinite(spid) ? spid : null;
  } catch {
    return null;
  }
}

async function handle(message) {
  const namespace = loadDriver();
  switch (message.op) {
    case OPS.PING:
      return { pong: true, pid: process.pid };

    case OPS.OPEN: {
      if (pool) {
        try {
          await pool.close();
        } catch {
          /* the previous pool is being replaced deliberately */
        }
        pool = null;
      }
      const opening = new namespace.ConnectionPool(message.payload.driverConfig);
      // A dropped pool must not turn an ordinary network blip into a crash.
      opening.on("error", () => {});
      await opening.connect();
      pool = opening;
      return { connected: true, spid: await readSpid() };
    }

    case OPS.QUERY: {
      const request = buildRequest(message.payload.handle, message.payload.inputs);
      const result =
        message.payload.mode === "batch"
          ? await request.batch(message.payload.text)
          : await request.query(message.payload.text);
      return encodeResult(result);
    }

    case OPS.BEGIN: {
      if (!pool) {
        const e = new Error("Local database is not connected");
        e.code = "ENOTCONNECTED";
        throw e;
      }
      const tx = new namespace.Transaction(pool);
      await tx.begin();
      const id = `tx_${++txSeq}`;
      transactions.set(id, tx);
      return { handle: id };
    }

    case OPS.COMMIT:
    case OPS.ROLLBACK: {
      const id = message.payload.handle;
      const tx = transactions.get(id);
      transactions.delete(id);
      if (!tx) return { done: true };
      if (message.op === OPS.COMMIT) await tx.commit();
      else await tx.rollback();
      return { done: true };
    }

    case OPS.KILL_SESSION: {
      // A short-lived side channel used only to close a session this process
      // family orphaned. It never touches the operational pool.
      const cleaner = new namespace.ConnectionPool(message.payload.driverConfig);
      cleaner.on("error", () => {});
      try {
        await cleaner.connect();
        const spid = Number(message.payload.spid);
        if (Number.isFinite(spid) && spid > 0) {
          await cleaner.request().batch(`KILL ${Math.trunc(spid)};`);
        }
        return { killed: true, spid };
      } finally {
        try {
          await cleaner.close();
        } catch {
          /* nothing to release */
        }
      }
    }

    case OPS.CLOSE: {
      transactions.clear();
      if (pool) {
        const closing = pool;
        pool = null;
        await closing.close();
      }
      return { closed: true };
    }

    default: {
      const e = new Error(`Unsupported driver operation: ${message.op}`);
      e.code = "EBADOP";
      throw e;
    }
  }
}

process.on("message", (message) => {
  if (!message || typeof message !== "object" || !message.id) return;
  Promise.resolve()
    .then(() => handle(message))
    .then((result) => {
      process.send?.({ id: message.id, attemptId: message.attemptId, ok: true, result });
    })
    .catch((err) => {
      process.send?.({
        id: message.id,
        attemptId: message.attemptId,
        ok: false,
        error: encodeError(err),
      });
    });
});

// A fault anywhere in the native binding stops HERE. The parent sees the exit
// code, reports EDRIVER_CRASH, and the till carries on running.
process.on("uncaughtException", (err) => {
  process.send?.({ id: null, attemptId: null, ok: false, fatal: true, error: encodeError(err) });
  process.exit(97);
});
process.on("unhandledRejection", (err) => {
  process.send?.({ id: null, attemptId: null, ok: false, fatal: true, error: encodeError(err) });
  process.exit(98);
});
