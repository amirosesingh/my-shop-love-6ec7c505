const path = require("node:path");
const { safeError } = require("./errors.cjs");

function databaseName(value) {
  const name=String(value??""); if(!/^[^\[\];{}\\/\x00-\x1f]{1,128}$/.test(name)) throw new Error("Invalid database name."); return `[${name.replaceAll("]","]]" )}]`;
}
class BackupService {
  constructor(connectionManager,secureConfig){this.connectionManager=connectionManager;this.secureConfig=secureConfig;}
  async backup(file){
    try{const profile=this.connectionManager.profile;if(!profile)throw new Error("SQL Server is not connected."); const target=path.resolve(file); await this.connectionManager.pool.request().input("file",target).query(`BACKUP DATABASE ${databaseName(profile.database)} TO DISK=@file WITH COPY_ONLY,CHECKSUM,INIT;`); return{ok:true,file:target};}catch(error){return safeError(error,"The database backup failed.");}
  }
  async restore(file){
    try{const profile=this.secureConfig?.credentials?.();if(!profile)throw new Error("SQL Server is not configured."); const target=path.resolve(file); await this.connectionManager.close(); await this.connectionManager.temporary(profile,"master",async(pool)=>{try{await pool.request().input("file",target).query(`ALTER DATABASE ${databaseName(profile.database)} SET SINGLE_USER WITH ROLLBACK IMMEDIATE; RESTORE DATABASE ${databaseName(profile.database)} FROM DISK=@file WITH REPLACE,RECOVERY;`);}finally{await pool.request().query(`IF DB_ID(N'${profile.database.replaceAll("'","''")}') IS NOT NULL ALTER DATABASE ${databaseName(profile.database)} SET MULTI_USER;`).catch(()=>undefined);}}); return{ok:true,file:target};}catch(error){return safeError(error,"The database restore failed.");}
  }
}
module.exports={BackupService,databaseName};
