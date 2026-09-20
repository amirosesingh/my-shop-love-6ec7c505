const fs=require("node:fs");
const path=require("node:path");
const { safeError }=require("./errors.cjs");

function migrationFiles(){const directory=path.join(__dirname,"..","..","database","sqlserver","migrations");return fs.readdirSync(directory).filter(name=>/^\d+_.+\.sql$/i.test(name)).sort().map(name=>({name,path:path.join(directory,name)}));}
async function runOnPool(connectionManager,pool){
 try{
  const applied=[];
  for(const file of migrationFiles()){
   const version=Number(file.name.split("_",1)[0]);
   const exists=await pool.request().input("version",version).query("IF OBJECT_ID(N'dbo.pos_schema_migrations',N'U') IS NULL SELECT CAST(0 AS bit) applied ELSE SELECT CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.pos_schema_migrations WHERE version=@version) THEN 1 ELSE 0 END AS bit) applied;");
   if(exists.recordset?.[0]?.applied)continue;
   const batches=fs.readFileSync(file.path,"utf8").split(/^\s*GO\s*$/gim).map(value=>value.trim()).filter(Boolean);
   const sql=connectionManager.sql();
   for(const batch of batches){
    if(/ALTER\s+DATABASE/i.test(batch)){await pool.request().batch(batch);continue;}
    const transaction=new sql.Transaction(pool);await transaction.begin();
    try{await new sql.Request(transaction).batch(batch);await transaction.commit();}
    catch(error){await Promise.resolve(transaction.rollback()).catch(()=>undefined);throw error;}
   }
   applied.push(file.name);
  }
  return{ok:true,applied};
 }catch(error){return safeError(error);}
}
async function applyMigrations(connectionManager,profile=null){
 if(profile)return connectionManager.temporary(profile,profile.database,(pool)=>runOnPool(connectionManager,pool));
 if(!connectionManager.pool)return{ok:false,code:"EDATABASE",error:"SQL Server is not connected."};
 return runOnPool(connectionManager,connectionManager.pool);
}
module.exports={applyMigrations,migrationFiles};
