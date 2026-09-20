const { createHash } = require("node:crypto");

const AGGREGATE_KINDS = new Set([
  "sale", "payment", "refund", "shift", "receiving", "stock",
  "transfer", "booking", "held_order", "general",
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function stableUuid(value) {
  const hex = createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function entityKey(table, row, match = null) {
  const primary = table.columns.filter((column) => column.primaryKey).map((column) => column.sqlServerColumn);
  const source = { ...(match ?? {}), ...(row ?? {}) };
  const key = Object.fromEntries(primary.map((column) => [column, source[column]]));
  if (!primary.length || Object.values(key).some((value) => value == null))
    throw new Error(`A complete stable key is required for ${table.sqlServerTable}.`);
  const encoded = JSON.stringify(key);
  if (encoded.length > 128) throw new Error(`The stable key for ${table.sqlServerTable} is too large.`);
  return encoded;
}

function branchFor(operation, fallback) {
  const row = { ...(operation.match ?? {}), ...(operation.rows?.[0] ?? operation.values ?? {}) };
  return String(row.store_id ?? row.branch_id ?? row.from_store_id ?? row.to_store_id ?? fallback ?? "global").slice(0, 128);
}

class AggregateRepository {
  constructor(connectionManager, operationsRepository) {
    this.connectionManager = connectionManager;
    this.operationsRepository = operationsRepository;
  }

  async commit(kind, aggregate) {
    if (!AGGREGATE_KINDS.has(kind)) throw new Error("Unsupported aggregate type.");
    const operations = this.operationsRepository.validate(aggregate?.operations);
    const operationId = aggregate?.operationId || stableUuid({ kind, operations });
    if (!/^[0-9a-f-]{36}$/i.test(operationId)) throw new Error("A stable aggregate UUID is required.");
    const payloadHash = createHash("sha256").update(JSON.stringify(canonical({ kind, operations }))).digest("hex");
    const sql = this.connectionManager.sql();
    const transaction = new sql.Transaction(this.operationsRepository.pool());
    await transaction.begin(sql.ISOLATION_LEVEL?.SERIALIZABLE);
    try {
      const prior = await new sql.Request(transaction).input("operation_id", sql.UniqueIdentifier, operationId)
        .query("SELECT note FROM dbo.local_operation_receipts WITH (UPDLOCK,HOLDLOCK) WHERE operation_id=@operation_id;");
      if (prior.recordset?.length) {
        if (prior.recordset[0].note !== payloadHash)
          throw Object.assign(new Error("The operation ID was already used with different data."), { code: "EIDEMPOTENCY" });
        await transaction.commit();
        return { ok: true, operationId, replayed: true, affected: 0 };
      }

      let affected = 0;
      for (const operation of operations) {
        if (this.operationsRepository.tables.get(operation.table)?.direction === "pull")
          throw new Error(`${operation.table} is centrally managed and cannot be changed by the local database.`);
        affected += await this.operationsRepository.applyOperation(transaction, operation);
        const table = this.operationsRepository.tables.get(operation.table);
        const records = operation.rows?.length ? operation.rows : [operation.values ?? operation.match];
        for (const record of records) {
          const request = new sql.Request(transaction)
            .input("entity_type", operation.table)
            .input("entity_id", entityKey(table, record, operation.match))
            .input("operation", operation.kind === "delete" ? "delete" : operation.kind === "insert" ? "insert" : "update")
            .input("branch_id", branchFor(operation, aggregate.branchId))
            .input("entity_version", Number(record?.row_version ?? 1))
            .input("aggregate_id", sql.UniqueIdentifier, operationId);
          await request.query(`INSERT dbo.sync_change_journal(entity_type,entity_id,operation,branch_id,entity_version,aggregate_id)
            VALUES(@entity_type,@entity_id,@operation,@branch_id,@entity_version,@aggregate_id);`);
        }
      }
      await new sql.Request(transaction)
        .input("operation_id", sql.UniqueIdentifier, operationId)
        .input("operation_type", kind)
        .input("entity_id", operationId)
        .input("note", payloadHash)
        .query("INSERT dbo.local_operation_receipts(operation_id,operation_type,entity_id,note) VALUES(@operation_id,@operation_type,@entity_id,@note);");
      await transaction.commit();
      return { ok: true, operationId, replayed: false, affected };
    } catch (error) {
      await Promise.resolve(transaction.rollback()).catch(() => undefined);
      throw error;
    }
  }
}

module.exports = { AggregateRepository, AGGREGATE_KINDS, stableUuid, canonical };
