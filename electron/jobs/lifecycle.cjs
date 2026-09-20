const { runBootstrap } = require("./bootstrap.cjs");
const { runRetention } = require("./retention.cjs");
const { localTableCounts } = require("../sync/reconciliation.cjs");

class LocalDataLifecycle {
  constructor({connectionManager,databaseService,jobManager,jobRepository,registry,cloud,syncCoordinator,checkpoints}){
    Object.assign(this,{connectionManager,databaseService,jobManager,jobRepository,registry,cloud,syncCoordinator,checkpoints});
  }
  bootstrapType(historyDays){return `bootstrap_${historyDays}`;}
  async bootstrap(branchId,historyDays,existing=null){return this.jobManager.run(this.bootstrapType(historyDays),context=>runBootstrap({registry:this.registry,cloud:this.cloud,connectionManager:this.connectionManager,checkpoints:this.checkpoints,branchId,historyDays,context}),existing,{branchId});}
  async retain(branchId,historyDays,existing=null){if(historyDays===7300)return{status:"completed",skipped:true};return this.jobManager.run("retention",context=>runRetention({connectionManager:this.connectionManager,days:historyDays,context}),existing,{branchId});}
  async resume(branchId,historyDays){const active=await this.jobRepository.active();if(!active||String(active.branch_id??"")!==String(branchId))return null;if(String(active.job_type).startsWith("bootstrap_"))return this.bootstrap(branchId,Number(String(active.job_type).slice(10))||historyDays,active);if(active.job_type==="retention")return this.retain(branchId,historyDays,active);return null;}
  async ensure({branchId,historyDays=90,force=false}){
    if(!branchId)throw Object.assign(new Error("This terminal needs a branch before local data can be prepared."),{code:"EBRANCH"});
    this.databaseService.transition("enabled_bootstrapping",{phase:"resume"});
    await this.resume(branchId,historyDays);
    const completed=await this.jobRepository.completed(this.bootstrapType(historyDays),branchId);
    if(force||!completed)await this.bootstrap(branchId,historyDays);
    const synced=await this.syncCoordinator.runNow({branchId,batchSize:500});
    if(!synced.ok)throw Object.assign(new Error(synced.error??"Final synchronization failed."),{code:"ESYNC"});
    await this.retain(branchId,historyDays);
    const differences=await this.reconcile(branchId,historyDays);
    if(differences.length)throw Object.assign(new Error(`Final reconciliation found ${differences.length} table differences.`),{code:"ERECONCILE",differences});
    this.databaseService.markReady({phase:"ready",branchId,historyDays});
    return{ok:true,branchId,historyDays,differences:[]};
  }
  async reconcile(branchId,historyDays=90){
    const [local,cloudRows]=await Promise.all([localTableCounts(this.connectionManager,this.registry),this.cloud.counts({branchId,historyDays})]);
    const cloud=Object.fromEntries((Array.isArray(cloudRows)?cloudRows:[]).map(row=>[row.table_name,Number(row.row_count)]));
    return this.registry.tables.filter(table=>cloud[table.cloudTable]!==undefined&&local[table.cloudTable]!==cloud[table.cloudTable]).map(table=>({table:table.cloudTable,local:local[table.cloudTable],cloud:cloud[table.cloudTable]}));
  }
}
module.exports={LocalDataLifecycle};
