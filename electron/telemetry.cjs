function createTelemetry({databaseService,syncCoordinator,jobRepository,configStore,terminalStore,app}){
 let timer=null;
 async function beat(){try{const base=String(configStore.get("backendUrl")??"").replace(/\/+$/,"");if(!base)return;const terminal=terminalStore.read();const db=databaseService.snapshot();const sync=syncCoordinator.snapshot();const job=databaseService.manager.pool?await jobRepository.active():null;await fetch(`${base}/api/public/health-metadata`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({terminalId:terminal?.tokenId??null,terminalName:terminal?.terminalName??null,branchId:terminal?.storeId??null,branchName:terminal?.storeName??null,sqlServerEnabled:db.enabled,sqlServerState:db.state,database:db.profile?.database??null,schemaVersion:null,sync,job,appVersion:app.getVersion(),heartbeatAt:new Date().toISOString()})});}catch{/* telemetry never interrupts trading */}}
 return{start(){if(timer)return;void beat();timer=setInterval(beat,60000);timer.unref?.();},stop(){if(timer)clearInterval(timer);timer=null;},beat};
}
module.exports={createTelemetry};
