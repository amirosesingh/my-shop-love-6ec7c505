class PullWorker {
  constructor({ connectionManager, cloud, checkpoints, registry, reader, conflicts }) {
    this.connectionManager = connectionManager; this.cloud = cloud; this.checkpoints = checkpoints;
    this.registry = registry; this.reader = reader; this.conflicts = conflicts;
  }
  async applyTable(transaction, table, changes, branchId) {
    if (!changes.length) return { applied: 0, conflicts: 0 };
    const entityIds = changes.map((change) => String(change.entity_id));
    const pending = await this.reader.unacknowledged(table, entityIds, transaction);
    const safe = [];
    let conflictCount = 0;
    for (const change of changes) {
      if (!pending.has(String(change.entity_id))) { safe.push(change); continue; }
      conflictCount += 1;
      await this.conflicts.record(transaction, {
        entityType: table.sqlServerTable, entityId: String(change.entity_id), branchId,
        remoteVersion: Number(change.row_version ?? 0), reason: "An unacknowledged local transaction has priority over this cloud change.",
      });
    }
    if (safe.length) await this.cloud.applyLocalBatch(transaction, table, {
      rows: safe.filter((change) => !change.tombstone),
      tombstones: safe.filter((change) => change.tombstone),
    });
    return { applied: safe.length, conflicts: conflictCount };
  }
  async run({ branchId, batchSize = 500 }) {
    if (!branchId) throw new Error("A branch is required for synchronization.");
    batchSize = Math.max(100, Math.min(2000, Number(batchSize) || 500));
    let merged = 0; let conflictCount = 0;
    let checkpoint = await this.checkpoints.get(branchId, "__feed__", "pull");
    while (true) {
      const batch = await this.cloud.pullBatch({ branchId, cursor: checkpoint?.committed_cursor ?? null, limit: batchSize });
      if (!batch.count) break;
      const sql = this.connectionManager.sql();
      const transaction = new sql.Transaction(this.connectionManager.pool);
      await transaction.begin(sql.ISOLATION_LEVEL?.SERIALIZABLE);
      try {
        const ordered = [...this.registry.tables].sort((a, b) => a.dependencyOrder - b.dependencyOrder || a.cloudTable.localeCompare(b.cloudTable));
        for (const table of ordered) {
          const result = await this.applyTable(transaction, table, batch.rows.filter((row) => row.table_name === table.cloudTable), branchId);
          merged += result.applied; conflictCount += result.conflicts;
        }
        for (const table of [...ordered].reverse()) {
          const result = await this.applyTable(transaction, table, batch.tombstones.filter((row) => row.table_name === table.cloudTable), branchId);
          merged += result.applied; conflictCount += result.conflicts;
        }
        await this.checkpoints.save(branchId, "__feed__", "pull", { committed_cursor: batch.cursor }, transaction);
        await transaction.commit();
      } catch (error) {
        await Promise.resolve(transaction.rollback()).catch(() => undefined);
        throw error;
      }
      checkpoint = { ...(checkpoint ?? {}), committed_cursor: batch.cursor };
      batch.rows.length = 0; batch.tombstones.length = 0;
      if (batch.count < batchSize) break;
    }
    return { merged, conflicts: conflictCount };
  }
}
module.exports = { PullWorker };
