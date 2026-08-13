/**
 * Local network discovery of Microsoft SQL Server instances.
 *
 * Two probes run in parallel:
 *  - the SQL Server Browser service (UDP 1434) answers a broadcast ping with a
 *    semicolon list describing every instance on that machine;
 *  - a plain TCP probe of localhost / this machine's hostname catches instances
 *    whose Browser service is stopped.
 */
const dgram = require("node:dgram");
const net = require("node:net");
const os = require("node:os");
const { execFile } = require("node:child_process");

const BROWSER_PORT = 1434;
const LISTEN_MS = 3000;
const TCP_PROBE_MS = 700;

/** Client packet the SQL Browser service answers with all local instances. */
const PING = Buffer.from([0x02]);

const NO_RESULT_HINT =
  "No instance answered. Start the 'SQL Server Browser' service on the database machine and allow UDP port 1434 through its firewall, or type the server name manually.";

/** Every IPv4 broadcast address this machine can reach, plus the global one. */
function broadcastTargets() {
  const targets = new Set(["255.255.255.255"]);
  const interfaces = os.networkInterfaces();
  for (const list of Object.values(interfaces)) {
    for (const iface of list ?? []) {
      if (iface.family !== "IPv4" || iface.internal) continue;
      const addr = iface.address.split(".").map(Number);
      const mask = String(iface.netmask || "255.255.255.0").split(".").map(Number);
      if (addr.length !== 4 || mask.length !== 4) continue;
      targets.add(addr.map((o, i) => (o | (~mask[i] & 255)) & 255).join("."));
    }
  }
  return [...targets];
}

/**
 * Browser replies look like:
 * ServerName;HOST;InstanceName;SQLEXPRESS;IsClustered;No;Version;15.0.2000.5;tcp;1433;;
 */
function parseReply(buffer, address) {
  const text = buffer.toString("utf8", 3);
  const out = [];
  for (const chunk of text.split(";;")) {
    const parts = chunk.split(";");
    if (parts.length < 2) continue;
    const map = {};
    for (let i = 0; i + 1 < parts.length; i += 2) map[parts[i]] = parts[i + 1];
    if (!map.InstanceName && !map.ServerName) continue;
    out.push({
      address,
      serverName: map.ServerName || address,
      instance: map.InstanceName || "",
      port: Number(map.tcp) || null,
      version: map.Version || null,
      source: "browser",
    });
  }
  return out;
}

function udpScan() {
  return new Promise((resolve) => {
    const found = [];
    let socket;
    try {
      socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    } catch (err) {
      resolve({ servers: [], error: err instanceof Error ? err.message : String(err) });
      return;
    }
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        /* already closed */
      }
      resolve({ servers: found, error: error ?? null });
    };
    const timer = setTimeout(() => finish(null), LISTEN_MS);

    socket.on("message", (msg, rinfo) => {
      try {
        found.push(...parseReply(msg, rinfo.address));
      } catch {
        /* malformed reply — ignore */
      }
    });
    socket.on("error", (err) => finish(err.message));
    socket.bind(() => {
      try {
        socket.setBroadcast(true);
      } catch {
        /* broadcast not permitted on this interface */
      }
      const targets = [...broadcastTargets(), "127.0.0.1"];
      for (const target of targets) {
        socket.send(PING, 0, PING.length, BROWSER_PORT, target, () => {});
      }
    });
  });
}

function tcpOpen(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(TCP_PROBE_MS);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

/** Default-instance probe so a stopped Browser service still yields a result. */
async function loopbackScan() {
  const hosts = ["127.0.0.1", os.hostname()].filter(Boolean);
  const seen = new Set();
  const results = [];
  await Promise.all(
    hosts.map(async (host) => {
      const key = host.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      if (await tcpOpen(host, 1433)) {
        results.push({
          address: host,
          serverName: host === "127.0.0.1" ? "localhost" : host,
          instance: "",
          port: 1433,
          version: null,
          source: "local",
        });
      }
    }),
  );
  return results;
}

const keyOf = (s) => `${String(s.serverName || s.address).toLowerCase()}\\${String(s.instance || "").toLowerCase()}`;

async function scan() {
  try {
    const [udp, local] = await Promise.all([udpScan(), loopbackScan()]);
    const merged = new Map();
    for (const server of [...udp.servers, ...local]) {
      const key = keyOf(server);
      const existing = merged.get(key);
      // Browser replies carry version/port detail, so they win over TCP probes.
      if (!existing || (!existing.port && server.port)) merged.set(key, server);
    }
    const servers = [...merged.values()].sort((a, b) =>
      `${a.serverName}${a.instance}`.localeCompare(`${b.serverName}${b.instance}`),
    );
    return {
      ok: true,
      servers,
      error: udp.error || undefined,
      hint: servers.length ? undefined : NO_RESULT_HINT,
    };
  } catch (err) {
    return {
      ok: false,
      servers: [],
      error: err instanceof Error ? err.message : String(err),
      hint: NO_RESULT_HINT,
    };
  }
}

module.exports = { scan };

/**
 * Windows registry probe: lists every SQL Server instance installed on THIS
 * machine, even when the SQL Browser service is stopped.
 */
function registryInstances() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") {
      resolve([]);
      return;
    }
    execFile(
      "reg",
      [
        "query",
        "HKLM\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\Instance Names\\SQL",
      ],
      { timeout: 4000, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) {
          resolve([]);
          return;
        }
        const names = [];
        for (const line of String(stdout).split(/\r?\n/)) {
          // "    SQLEXPRESS    REG_SZ    MSSQL16.SQLEXPRESS"
          const m = /^\s{2,}(\S+)\s+REG_SZ\s+(\S+)\s*$/.exec(line);
          if (m) names.push(m[1]);
        }
        resolve(names);
      },
    );
  });
}

/**
 * Everything this PC can offer as a connection target: loopback names plus
 * every locally installed instance, merged with whatever the network scan saw.
 */
async function scanLocalInstances() {
  const hostname = os.hostname();
  try {
    const [instances, network] = await Promise.all([registryInstances(), scan()]);
    const targets = [];
    const push = (value) => {
      const text = String(value || "").trim();
      if (!text) return;
      if (!targets.some((t) => t.toLowerCase() === text.toLowerCase())) targets.push(text);
    };
    push("127.0.0.1");
    push("localhost");
    push(hostname);
    for (const instance of instances) {
      if (/^MSSQLSERVER$/i.test(instance)) continue; // default instance = bare host
      push(`${hostname}\\${instance}`);
      push(`localhost\\${instance}`);
    }
    const servers = [
      ...instances.map((instance) => ({
        address: hostname,
        serverName: hostname,
        instance: /^MSSQLSERVER$/i.test(instance) ? "" : instance,
        port: null,
        version: null,
        source: "registry",
      })),
      ...(network.servers ?? []),
    ];
    for (const server of network.servers ?? []) {
      push(server.instance ? `${server.serverName}\\${server.instance}` : server.serverName);
    }
    return {
      ok: true,
      hostname,
      targets,
      servers,
      hint: targets.length > 2 ? undefined : NO_RESULT_HINT,
    };
  } catch (err) {
    return {
      ok: false,
      hostname,
      targets: ["127.0.0.1", "localhost", hostname].filter(Boolean),
      servers: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

module.exports.scanLocalInstances = scanLocalInstances;
