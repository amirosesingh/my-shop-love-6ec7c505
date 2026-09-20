async function reconcile({ registry, localCounts, cloudCounts, branchId }) {
  const differences = [];
  for (const table of registry.tables) {
    const [local, cloud] = await Promise.all([localCounts(table.sqlServerTable, branchId), cloudCounts(table.cloudTable, branchId)]);
    if (local !== cloud) differences.push({ table: table.cloudTable, local, cloud });
  }
  return { ok: differences.length === 0, differences };
}
async function localTableCounts(connectionManager,registry){const output={};for(const table of registry.tables){const result=await connectionManager.pool.request().query(`SELECT COUNT_BIG(*) count FROM dbo.[${table.sqlServerTable}];`);output[table.cloudTable]=Number(result.recordset?.[0]?.count??0);}return output;}
module.exports = { reconcile, localTableCounts };
