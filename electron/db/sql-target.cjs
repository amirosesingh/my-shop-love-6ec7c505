/**
 * The single place a SQL Server target is worked out.
 *
 * Every layer — the TCP probe, the authentication handshake, the catalogue
 * listing, the database lock and the operational pool — must agree on exactly
 * one host, one port and one instance name. When each layer re-derived the
 * target from raw form values they disagreed, and a direct connection could
 * silently fall back to a SQL Browser lookup on UDP 1434.
 */

/**
 * `localhost\SQLEXPRESS`, `HOST\INST,1435`, `tcp:host,1433` and plain hosts all
 * arrive in the same field. They are split apart here and nowhere else.
 */
function parseServerField(raw, fallbackPort) {
  let text = String(raw ?? "").trim();
  text = text.replace(/^tcp:/i, "");
  let port = Number(fallbackPort) || 1433;
  // A separately supplied port is as explicit as HOST,PORT.
  let explicitPort = Number(fallbackPort) > 0;
  const comma = text.lastIndexOf(",");
  if (comma > -1) {
    const maybePort = Number(text.slice(comma + 1).trim());
    if (Number.isFinite(maybePort) && maybePort > 0) {
      port = maybePort;
      explicitPort = true;
      text = text.slice(0, comma).trim();
    }
  }
  let instanceName = "";
  const slash = text.indexOf("\\");
  if (slash > -1) {
    instanceName = text.slice(slash + 1).trim();
    text = text.slice(0, slash).trim();
  }
  return { host: text || "localhost", instanceName, port, explicitPort };
}

/** True when the operator asked for a plain `host,port` connection. */
const isDirectConnect = (config) => config?.directConnect === true;

/**
 * Collapses `PCNAME\SQLEXPRESS` plus an explicit port into one direct target.
 *
 * The instance name is decoration once a port is known, so it is dropped: the
 * driver must never be given a chance to resolve it again.
 */
function normalizeDirectTarget(config) {
  const parsed = parseServerField(config?.server ?? config?.host, config?.port);
  const proven = Number(config?.resolvedPort);
  const port = Number.isFinite(proven) && proven > 0 ? proven : parsed.port;
  return {
    ...parsed,
    instanceName: "",
    droppedInstanceName: parsed.instanceName || null,
    port,
    portKnown: true,
    browserAnswered: false,
    provenPort: true,
    direct: true,
    address: `${parsed.host},${port}`,
  };
}

/** The exact string handed to a driver for a `host,port` connection. */
const directTargetString = (target) => `${target.host},${target.port}`;

/**
 * Migration guard.
 *
 * The direct path has no SQL Browser fallback, so a named instance with no
 * pinned port cannot work. Report it rather than letting it fail at first sale.
 */
function auditConnectionConfig(config) {
  if (!config || !config.server) {
    return { ok: true, configured: false, needsPort: false, issues: [] };
  }
  const parsed = parseServerField(config.server, config.port);
  const direct = isDirectConnect(config);
  const issues = [];
  const needsPort = !!parsed.instanceName && !parsed.explicitPort;
  if (needsPort) {
    issues.push({
      code: "EMISSINGPORT",
      severity: direct ? "error" : "warning",
      message: `"${config.server}" names the instance "${parsed.instanceName}" but no TCP port is pinned.`,
      hint: "Enter the instance's fixed TCP port (Setup connection > Server), because direct connections never ask the SQL Server Browser service for a dynamic port.",
    });
  }
  return {
    ok: issues.length === 0,
    configured: true,
    direct,
    needsPort,
    host: parsed.host,
    instanceName: parsed.instanceName || null,
    port: parsed.explicitPort ? parsed.port : null,
    target: parsed.explicitPort ? `${parsed.host},${parsed.port}` : null,
    issues,
  };
}

module.exports = {
  parseServerField,
  isDirectConnect,
  normalizeDirectTarget,
  directTargetString,
  auditConnectionConfig,
};
