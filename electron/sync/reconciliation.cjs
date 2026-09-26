const { scopedWhere } = require("../db/branch-scope.cjs");

const exactCount = (value) => String(value ?? "0");

async function reconcile({ registry, localCounts, cloudCounts, branchId }) {
  const differences = [];
  for (const table of registry.tables) {
    const [local, cloud] = await Promise.all([localCounts(table.sqlServerTable, branchId), cloudCounts(table.cloudTable, branchId)]);
    if (exactCount(local) !== exactCount(cloud)) differences.push({ table: table.cloudTable, local: exactCount(local), cloud: exactCount(cloud) });
  }
  return { ok: differences.length === 0, differences };
}
async function localTableCounts(connectionManager,registry,branchId,historyDays=90){
  if(!branchId)throw Object.assign(new Error("A branch is required for verification."),{code:"EBRANCH"});
  const output={};
  const cutoff=new Date(Date.now()-Math.max(30,Number(historyDays)||90)*86400000);
  for(const table of registry.tables){
    const request=connectionManager.pool.request().input("branch",String(branchId)).input("cutoff",cutoff);
    const where=scopedWhere(registry,table,{historyDays,alias:"source"});
    const result=await request.query(`SELECT CONVERT(varchar(40),COUNT_BIG(*)) count FROM dbo.[${table.sqlServerTable}] source WHERE ${where};`);
    output[table.cloudTable]=exactCount(result.recordset?.[0]?.count);
  }
  return output;
}
module.exports = { reconcile, localTableCounts, exactCount };
