const { loadRegistry } = require("../schema-registry.cjs");

const MAX_BATCH_ROWS = 2000;
const MAX_ENCODED_BYTES = 6 * 1024 * 1024;

function valueForSql(value) {
  if (value === undefined) return null;
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return value;
}

class OperationsRepository {
  constructor(connectionManager, registry = loadRegistry()) {
    this.connectionManager = connectionManager;
    this.tables = new Map((registry.tables ?? []).map((table) => [table.sqlServerTable, table]));
  }
  pool() {
    if (!this.connectionManager.pool) throw Object.assign(new Error("SQL Server is not connected."), { code: "EDATABASE" });
    return this.connectionManager.pool;
  }
  validate(ops) {
    if (!Array.isArray(ops) || !ops.length || ops.length > 200) throw new Error("A batch must contain 1 to 200 operations.");
    if (Buffer.byteLength(JSON.stringify(ops), "utf8") > MAX_ENCODED_BYTES) throw new Error("The operation batch exceeds 6 MiB.");
    for (const op of ops) {
      const table = this.tables.get(op?.table);
      if (!table) throw new Error("Unsupported business table.");
      if (!["insert", "upsert", "update", "delete"].includes(op.kind)) throw new Error("Unsupported business operation.");
      const allowed = new Set(table.columns.map((column) => column.sqlServerColumn));
      const rows = op.rows ?? (op.values ? [op.values] : []);
      if (rows.length > MAX_BATCH_ROWS) throw new Error("A batch cannot exceed 2,000 rows.");
      for (const row of rows) {
        if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Business rows must be objects.");
        for (const key of Object.keys(row)) if (!allowed.has(key)) throw new Error(`Unsupported column for ${op.table}.`);
      }
      for (const key of Object.keys(op.match ?? {})) if (!allowed.has(key)) throw new Error(`Unsupported match column for ${op.table}.`);
    }
    return ops;
  }
  async apply(context, operations) {
    const ops = this.validate(operations);
    const sql = this.connectionManager.sql();
    const transaction = new sql.Transaction(this.pool());
    await transaction.begin(sql.ISOLATION_LEVEL?.SERIALIZABLE);
    let affected = 0;
    try {
      for (const op of ops) affected += await this.applyOperation(transaction, op);
      await transaction.commit();
      return { ok: true, context: String(context ?? "").slice(0, 160), affected };
    } catch (error) {
      await Promise.resolve(transaction.rollback()).catch(() => undefined);
      throw error;
    }
  }
  async applyOperation(transaction, op) {
    const table = this.tables.get(op.table);
    const primary = table.columns.filter((column) => column.primaryKey).map((column) => column.sqlServerColumn);
    const hasRowVersion = table.columns.some((column) => column.sqlServerColumn === "row_version");
    if (op.kind === "insert" || op.kind === "upsert") {
      let affected = 0;
      for (const row of op.rows ?? (op.values ? [op.values] : [])) {
        const columns = Object.keys(row);
        if (!columns.length || primary.some((key) => row[key] == null)) throw new Error(`A complete stable key is required for ${op.table}.`);
        const request = new (this.connectionManager.sql().Request)(transaction);
        columns.forEach((column, index) => request.input(`v${index}`, valueForSql(row[column])));
        const source = columns.map((column, index) => `@v${index} AS [${column}]`).join(",");
        const on = primary.map((column) => `target.[${column}]=source.[${column}]`).join(" AND ");
        const updates = columns.filter((column) => !primary.includes(column) && column !== "row_version").map((column) => `target.[${column}]=source.[${column}]`);
        if (hasRowVersion) updates.push("target.[row_version]=COALESCE(target.[row_version],0)+1");
        const update = updates.join(",");
        const insertColumns = columns.map((column) => `[${column}]`).join(",");
        const insertValues = columns.map((column) => `source.[${column}]`).join(",");
        const matched = op.kind === "upsert" && update && !["immutable_reversal", "movement_delta"].includes(table.conflictRule) ? `WHEN MATCHED THEN UPDATE SET ${update}` : "";
        const result = await request.query(`MERGE dbo.[${op.table}] WITH (HOLDLOCK) AS target USING (SELECT ${source}) AS source ON ${on} ${matched} WHEN NOT MATCHED THEN INSERT (${insertColumns}) VALUES (${insertValues});`);
        affected += result.rowsAffected?.reduce((sum, count) => sum + count, 0) ?? 0;
      }
      return affected;
    }
    const match = Object.entries(op.match ?? {});
    if (!match.length) throw new Error("Update and delete operations require a match.");
    const request = new (this.connectionManager.sql().Request)(transaction);
    match.forEach(([, value], index) => request.input(`m${index}`, valueForSql(value)));
    const where = match.map(([column], index) => `[${column}]=@m${index}`).join(" AND ");
    let query;
    if (op.kind === "delete") query = `DELETE FROM dbo.[${op.table}] WHERE ${where};`;
    else {
      const values = Object.entries(op.values ?? {}).filter(([column]) => column !== "row_version");
      if (!values.length && !hasRowVersion) return 0;
      values.forEach(([, value], index) => request.input(`v${index}`, valueForSql(value)));
      const setters = values.map(([column], index) => `[${column}]=@v${index}`);
      if (hasRowVersion) setters.push("[row_version]=COALESCE([row_version],0)+1");
      query = `UPDATE dbo.[${op.table}] SET ${setters.join(",")} WHERE ${where};`;
    }
    const result = await request.query(query);
    return result.rowsAffected?.reduce((sum, count) => sum + count, 0) ?? 0;
  }
  async snapshot(branchId = null) {
    // Branch-owned rows are loaded separately with an explicit predicate.
    // The list below contains only shared catalogue/reference data.
    const names = ["products", "members", "stores", "promotions", "member_tiers"];
    const output = {};
    for (const name of names) {
      if (!this.tables.has(name)) continue;
      const result = await this.pool().request().query(`SELECT TOP (2000) * FROM dbo.[${name}] ORDER BY [id];`);
      output[name === "member_tiers" ? "tiers" : name] = result.recordset ?? [];
    }
    if (this.tables.has("pos_settings")) {
      const result = await this.pool().request().query("SELECT TOP (1) * FROM dbo.pos_settings ORDER BY id;");
      output.settings = result.recordset?.[0] ?? null;
    }
    if (this.tables.has("shifts")) {
      const result = branchId
        ? await this.pool().request().input("branch", String(branchId)).query("SELECT TOP (2000) * FROM dbo.shifts WHERE store_id=@branch ORDER BY [id];")
        : { recordset: [] };
      output.shifts = result.recordset ?? [];
    }
    if (this.tables.has("sales")) {
      if (!branchId) {
        output.sales = [];
      } else {
        // A receipt is a graph, not just its header. Return the children in the
        // same SQL batch so the renderer can display/reprint a locally committed
        // sale immediately, including while the cloud is unavailable.
        const hasItems = this.tables.has("sale_items");
        const hasPayments = this.tables.has("payment_transactions");
        const result = await this.pool().request().input("branch", String(branchId)).query(`
          DECLARE @recent_sales TABLE (id uniqueidentifier PRIMARY KEY);
          INSERT @recent_sales(id)
            SELECT TOP (500) id FROM dbo.sales WHERE store_id=@branch ORDER BY created_at DESC,id;
          SELECT s.* FROM dbo.sales s JOIN @recent_sales r ON r.id=s.id ORDER BY s.created_at DESC,s.id;
          ${hasItems ? "SELECT i.* FROM dbo.sale_items i JOIN @recent_sales r ON r.id=i.sale_id ORDER BY i.sale_id,i.id;" : "SELECT TOP (0) CAST(NULL AS uniqueidentifier) sale_id;"}
          ${hasPayments ? "SELECT p.* FROM dbo.payment_transactions p JOIN @recent_sales r ON r.id=p.sale_id ORDER BY p.sale_id,p.created_at,p.id;" : "SELECT TOP (0) CAST(NULL AS uniqueidentifier) sale_id;"}
        `);
        const recordsets = result.recordsets ?? [result.recordset ?? [], [], []];
        const sales = recordsets[0] ?? [];
        const items = recordsets[1] ?? [];
        const payments = recordsets[2] ?? [];
        const bySale = (rows) => {
          const grouped = new Map();
          for (const row of rows) {
            const key = String(row.sale_id ?? "");
            if (!key) continue;
            const group = grouped.get(key) ?? [];
            group.push(row);
            grouped.set(key, group);
          }
          return grouped;
        };
        const itemsBySale = bySale(items);
        const paymentsBySale = bySale(payments);
        const jsonArray = (value) => {
          if (Array.isArray(value)) return value;
          if (typeof value !== "string" || !value.trim()) return [];
          try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
          catch { return []; }
        };
        output.sales = sales.map((sale) => {
          const embedded = jsonArray(sale.payments);
          const ledger = (paymentsBySale.get(String(sale.id)) ?? []).map((payment) => {
            const metadata = (() => {
              try { return typeof payment.metadata === "string" ? JSON.parse(payment.metadata) : (payment.metadata ?? {}); }
              catch { return {}; }
            })();
            return {
              id: String(payment.id ?? ""),
              method: String(payment.method ?? payment.payment_method ?? "cash"),
              amount: Number(payment.amount ?? 0),
              reference: payment.reference ?? payment.transaction_reference ?? undefined,
              referenceNote: metadata.reference_note ?? undefined,
              bankName: metadata.bank ?? undefined,
            };
          });
          return {
            ...sale,
            sale_items: itemsBySale.get(String(sale.id)) ?? [],
            payments: embedded.length ? embedded : ledger,
          };
        });
      }
    }
    return { ok: true, ...output };
  }
}

module.exports = { OperationsRepository, MAX_BATCH_ROWS, MAX_ENCODED_BYTES };
