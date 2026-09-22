const { safeError } = require("./errors.cjs");
const { listDatabases } = require("./catalog.cjs");
const { validateDatabase } = require("./health.cjs");

const STATES = new Set([
  "disabled", "enabled_unconfigured", "enabled_connecting", "enabled_validating",
  "enabled_bootstrapping", "enabled_ready", "enabled_degraded", "enabled_error",
]);

class DatabaseService {
  constructor({ secureConfig, manager, publish = () => {} }) {
    this.secureConfig = secureConfig; this.manager = manager; this.publish = publish;
    this.state = secureConfig.enabled() ? (secureConfig.profile() ? "enabled_connecting" : "enabled_unconfigured") : "disabled";
    this.detail = null; this.lastCheckedAt = null;
  }
  snapshot() {
    return { state: this.state, enabled: this.secureConfig.enabled(), configured: Boolean(this.secureConfig.profile()),
      connected: this.state === "enabled_ready", tradingReady: this.state === "enabled_ready", profile: this.secureConfig.profile(), detail: this.detail,
      lastCheckedAt: this.lastCheckedAt };
  }
  transition(state, detail = null) {
    if (!STATES.has(state)) throw new Error(`Unknown database state: ${state}`);
    this.state = state; this.detail = detail; this.publish(this.snapshot()); return this.snapshot();
  }
  async setEnabled(value) {
    this.secureConfig.setEnabled(value === true);
    if (!value) { await this.manager.close(); return this.transition("disabled"); }
    if (!this.secureConfig.profile()) return this.transition("enabled_unconfigured");
    return this.restore();
  }
  async testServer(profile) { return this.manager.testServer(profile); }
  async databases(profile) { return listDatabases(this.manager, profile); }
  async health() {
    if (!this.manager.pool) return { ok: false, connected: false, state: this.snapshot() };
    try { const started=Date.now(); const result=await this.manager.pool.request().query("SELECT DB_NAME() database_name, CHANGE_TRACKING_CURRENT_VERSION() change_tracking_version;"); return { ok:true,connected:true,latencyMs:Date.now()-started,...result.recordset?.[0],state:this.snapshot() }; }
    catch(error){return {...safeError(error),connected:false,state:this.snapshot()};}
  }
  async schemaStatus() { const profile=this.secureConfig.credentials(); return profile ? validateDatabase(this.manager,profile) : {ok:false,code:"EDATABASE",error:"No database is configured."}; }
  async validate(profile) {
    return validateDatabase(this.manager, profile);
  }
  async saveAndConnect(profile) {
    try {
      const validation = await validateDatabase(this.manager, profile);
      if (!validation.ok || !validation.ready) {
        this.transition("enabled_error", validation);
        return validation;
      }
      this.transition("enabled_connecting");
      await this.manager.open(profile);
      const saved = this.secureConfig.save(profile);
      this.lastCheckedAt = new Date().toISOString();
      this.transition("enabled_bootstrapping");
      return { ok: true, profile: saved, state: this.snapshot() };
    } catch (error) {
      await this.manager.close().catch(() => undefined);
      const safe = safeError(error);
      this.transition("enabled_error", safe);
      return safe;
    }
  }
  async disconnect() { await this.manager.close(); return this.transition(this.secureConfig.enabled() ? "enabled_degraded" : "disabled"); }
  async remove() { await this.manager.close(); this.secureConfig.remove(); return this.transition("disabled"); }
  async restore() {
    if (!this.secureConfig.enabled()) return this.transition("disabled");
    const profile = this.secureConfig.credentials();
    if (!profile) return this.transition("enabled_unconfigured");
    try {
      this.transition("enabled_connecting");
      await this.manager.open(profile);
      this.lastCheckedAt = new Date().toISOString();
      return this.transition("enabled_bootstrapping");
    } catch (error) {
      await this.manager.close().catch(() => undefined);
      return this.transition("enabled_error", safeError(error));
    }
  }
  markReady(detail = null) { return this.transition("enabled_ready", detail); }
  markDegraded(detail) { return this.transition("enabled_degraded", detail); }
}

module.exports = { DatabaseService, STATES };
