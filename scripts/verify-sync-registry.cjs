const fs=require("node:fs");const path=require("node:path");
require("./verify-sqlserver-schema.cjs");
const root=path.resolve(__dirname,"..");const registry=JSON.parse(fs.readFileSync(path.join(root,"database","sqlserver","schema-registry.json"),"utf8"));const schema=fs.readFileSync(path.join(root,"supabase","schema.sql"),"utf8");const errors=[];
for(const table of registry.tables.filter(table=>table.columns.some(column=>column.cloudColumn==="id"))){
 for(const marker of [`sync_apply_${table.cloudTable}`,`sync_feed_${table.cloudTable}`,`WHEN '${table.cloudTable}'`])if(!schema.includes(marker))errors.push(`${table.cloudTable}: missing ${marker}`);
}
for(const marker of ["pos_sync_push_batch","pos_sync_pull","pos_old_receipt_lookup","sync_idempotency_receipts","sync_change_feed","SYNC_BRANCH_FORBIDDEN"])if(!schema.includes(marker))errors.push(`Supabase sync contract missing ${marker}`);
if(errors.length){console.error(errors.join("\n"));process.exit(1);}console.log(`Sync contract verified: ${registry.tables.length} decisions`);
