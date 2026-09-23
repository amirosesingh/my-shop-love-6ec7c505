class SyncCoordinator {
  constructor({ pushWorker, pullWorker, publish = () => {} }) { this.pushWorker=pushWorker; this.pullWorker=pullWorker; this.publish=publish; this.running=false; this.paused=false; this.status={ phase:"idle", pending:0, failed:0, conflicts:0, lastPushAt:null, lastPullAt:null, lastError:null }; }
  snapshot() { return { ...this.status, running:this.running, paused:this.paused }; }
  async runNow(options) {
    if (this.running) return { ...this.snapshot(), busy:true };
    if (this.paused) return { ...this.snapshot(), paused:true };
    this.running=true;
    try {
      this.status.phase="pushing"; this.publish(this.snapshot());
      const pushed=await this.pushWorker.run(options); this.status.lastPushAt=new Date().toISOString();
      this.status.phase="pulling"; this.publish(this.snapshot());
      const pulled=await this.pullWorker.run(options); this.status.lastPullAt=new Date().toISOString(); this.status.conflicts=Number(pulled.conflicts??this.status.conflicts);
      this.status.phase="idle"; this.status.lastError=null; return { ok:true,...this.snapshot(),...pushed,...pulled };
    } catch(error) { this.status.phase="idle"; this.status.failed+=1; this.status.lastError=String(error?.message??error); return { ok:false,...this.snapshot(),code:error?.code??"ESYNC",error:this.status.lastError }; }
    finally { this.running=false; this.publish(this.snapshot()); }
  }
  pause(){this.paused=true;this.publish(this.snapshot());return this.snapshot();}
  resume(){this.paused=false;this.publish(this.snapshot());return this.snapshot();}
}
module.exports = { SyncCoordinator };
