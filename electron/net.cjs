/**
 * Main-process HTTP for the update feed.
 *
 * The renderer is served from http://127.0.0.1:43117, so any request to the
 * update bucket is cross-origin and the browser cancels it when the bucket
 * sends no Access-Control-Allow-Origin header. Requests made here run outside
 * the window, where CORS does not apply.
 *
 * The window supplies the address, so this file is a security boundary: the
 * main process must never fetch an address just because the page asked. Only
 * secure requests to the configured update hosts leave here, redirects are
 * checked instead of followed blindly, and machines on the local network are
 * out of reach.
 */
const { net } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

/** Update host used when a build carries no configuration of its own. */
const DEFAULT_UPDATE_HOST = "updatecms.luckycharmsdnbhd.com";

/** Hosts that serve a GitHub release, used only when the feed is GitHub. */
const GITHUB_HOSTS = [
  "github.com",
  "api.github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
  "raw.githubusercontent.com",
];

function hostOf(value) {
  try {
    return new URL(String(value)).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Host baked into the installer by the release pipeline, when there is one. */
function bakedHost() {
  try {
    const text = fs.readFileSync(path.join(process.resourcesPath || "", "app-update.yml"), "utf8");
    const url = /^\s*url:\s*(\S+)/m.exec(text);
    if (url) return hostOf(url[1]);
    if (/provider:\s*github/i.test(text)) return "github";
  } catch {
    /* not packaged, or no feed baked in */
  }
  return null;
}

/**
 * Every host this application is allowed to reach, built from configuration
 * the window cannot influence: environment of the desktop process and the
 * feed written into the installer.
 */
function allowedHosts() {
  const hosts = new Set([DEFAULT_UPDATE_HOST]);
  const add = (value) => {
    if (!value) return;
    if (value === "github") {
      for (const h of GITHUB_HOSTS) hosts.add(h);
      return;
    }
    const host = value.includes("://") ? hostOf(value) : String(value).toLowerCase();
    if (host) hosts.add(host);
  };
  const feed = (process.env.POS_UPDATE_FEED || "").trim();
  if (feed.toLowerCase() === "github") add("github");
  else add(feed);
  add((process.env.POS_UPDATE_BASE_URL || "").trim());
  add((process.env.VITE_UPDATE_BASE_URL || "").trim());
  add((process.env.POS_UPDATE_EXTRA_HOST || "").trim());
  add(bakedHost());
  return hosts;
}

/** Loopback and private ranges: never reachable from the page. */
function isPrivateHost(host) {
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "[::1]" || host === "::1") return true;
  const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ip) return false;
  const [a, b] = [Number(ip[1]), Number(ip[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/**
 * Accept an address, or explain why not. Anything other than a secure request
 * to a configured update host is refused before a socket is opened.
 */
function checkUrl(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    return { ok: false, error: "That address is not a valid web address." };
  }
  if (url.protocol !== "https:") {
    return { ok: false, error: "Only secure (https) addresses can be requested." };
  }
  const host = url.hostname.toLowerCase();
  if (isPrivateHost(host)) {
    return { ok: false, error: "Addresses on this machine or local network cannot be requested." };
  }
  if (!allowedHosts().has(host)) {
    return { ok: false, error: `"${host}" is not an update server this application may contact.` };
  }
  return { ok: true, url: url.toString() };
}

/** One request, resolved with the status and the raw body buffer. */
function request(url, { method = "GET", headers = {}, timeoutMs = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(
      () => done(reject, new Error("The update server did not answer in time.")),
      timeoutMs,
    );

    const allowed = checkUrl(url);
    if (!allowed.ok) {
      done(reject, new Error(allowed.error));
      return;
    }

    let req;
    try {
      // "manual" so a redirect off the allowed hosts ends the request instead
      // of quietly delivering somewhere else.
      req = net.request({ method, url: allowed.url, redirect: "manual" });
    } catch (error) {
      done(reject, error instanceof Error ? error : new Error(String(error)));
      return;
    }
    for (const [key, value] of Object.entries(headers)) req.setHeader(key, value);

    let hops = 0;
    req.on("redirect", (_status, _method, redirectUrl) => {
      if (++hops > 5) {
        req.abort();
        done(reject, new Error("The update server redirected too many times."));
        return;
      }
      const next = checkUrl(redirectUrl);
      if (!next.ok) {
        req.abort();
        done(reject, new Error(next.error));
        return;
      }
      req.followRedirect();
    });

    req.on("response", (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () =>
        done(resolve, { status: res.statusCode, body: Buffer.concat(chunks) }),
      );
      res.on("error", (error) => done(reject, error));
    });
    req.on("error", (error) => done(reject, error));
    req.end();
  });
}


async function getJson(url) {
  try {
    const res = await request(url, {
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      timeoutMs: 30000,
    });
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, data: JSON.parse(res.body.toString("utf8")) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function head(url) {
  try {
    const res = await request(url, { method: "HEAD", timeoutMs: 20000 });
    return { ok: res.status >= 200 && res.status < 300, status: res.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function getBinary(url) {
  try {
    const res = await request(url, { timeoutMs: 600000 });
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, base64: res.body.toString("base64") };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Turn a raw Chromium network failure into something a counter can act on.
 * The original text is kept alongside so a report still carries the detail.
 */
function explainNetworkError(message) {
  const text = String(message || "");
  const code = /net::([A-Z0-9_]+)/.exec(text)?.[1] ?? null;
  const map = {
    ERR_SSL_PROTOCOL_ERROR:
      "The update server refused a secure connection. This is usually security software inspecting traffic, or the server's certificate settings.",
    ERR_CERT_AUTHORITY_INVALID:
      "The update server's security certificate is not trusted by this computer.",
    ERR_CERT_DATE_INVALID:
      "The update server's certificate looks expired — check this computer's date and time.",
    ERR_CERT_COMMON_NAME_INVALID:
      "The update server's certificate does not match its address.",
    ERR_CONNECTION_RESET: "The connection to the update server was cut off part-way.",
    ERR_CONNECTION_CLOSED: "The update server closed the connection before finishing.",
    ERR_CONNECTION_TIMED_OUT: "The update server did not answer in time.",
    ERR_NAME_NOT_RESOLVED: "The update server's address could not be found on this network.",
    ERR_INTERNET_DISCONNECTED: "This computer is not connected to the internet.",
    ERR_PROXY_CONNECTION_FAILED: "This computer's proxy blocked the connection to the update server.",
    ERR_NETWORK_CHANGED: "The network changed while downloading.",
  };
  return { code, friendly: (code && map[code]) || text || "The download could not be completed." };
}

/**
 * Download to a file, streaming, with resume support so an interrupted
 * transfer continues instead of starting again. Never follows a redirect off
 * the allowed update hosts.
 */
function downloadTo(url, destination, { onProgress, timeoutMs = 900000, resume = false } = {}) {
  return new Promise((resolve, reject) => {
    const allowed = checkUrl(url);
    if (!allowed.ok) {
      reject(new Error(allowed.error));
      return;
    }
    let already = 0;
    if (resume) {
      try {
        already = fs.statSync(destination).size;
      } catch {
        already = 0;
      }
    }

    let settled = false;
    let req = null;
    let activeOut = null;
    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      try {
        req?.abort();
      } catch {
        /* request already closed */
      }
      try {
        activeOut?.destroy();
      } catch {
        /* file stream already closed */
      }
      done(reject, new Error("The update server stopped responding during the download."));
    }, timeoutMs);

    try {
      req = net.request({ method: "GET", url: allowed.url, redirect: "manual" });
    } catch (error) {
      done(reject, error instanceof Error ? error : new Error(String(error)));
      return;
    }
    // Ask the CDN for the installer bytes exactly as published. Compression
    // transforms and stale intermediary caches make resumed executable
    // downloads fragile, especially when a Range request is involved.
    req.setHeader("Accept", "application/octet-stream");
    req.setHeader("Accept-Encoding", "identity");
    req.setHeader("Cache-Control", "no-cache");
    req.setHeader("Pragma", "no-cache");
    if (already > 0) req.setHeader("Range", `bytes=${already}-`);

    let hops = 0;
    req.on("redirect", (_status, _method, redirectUrl) => {
      if (++hops > 5) {
        req.abort();
        done(reject, new Error("The update server redirected too many times."));
        return;
      }
      const next = checkUrl(redirectUrl);
      if (!next.ok) {
        req.abort();
        done(reject, new Error(next.error));
        return;
      }
      req.followRedirect();
    });

    req.on("response", (res) => {
      const status = res.statusCode;
      const partial = status === 206 && already > 0;
      if (status !== 200 && !partial) {
        res.resume?.();
        // A stale/oversized partial commonly receives 416. Remove it so the
        // next retry starts clean instead of repeating the same bad Range.
        if (status === 416 && already > 0) {
          try {
            fs.truncateSync(destination, 0);
          } catch {
            /* next retry will still fall back to a clean full response */
          }
        }
        done(reject, new Error(`The update server answered HTTP ${status}.`));
        return;
      }

      let start = partial ? already : 0;
      let total = Number(res.headers["content-length"] || 0) + start;

      if (partial) {
        const rawRange = String(res.headers["content-range"] || "");
        const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(rawRange);
        const rangeStart = match ? Number(match[1]) : NaN;
        const rangeTotal = match && match[3] !== "*" ? Number(match[3]) : NaN;
        if (!match || rangeStart !== already) {
          res.resume?.();
          try {
            fs.truncateSync(destination, 0);
          } catch {
            /* best effort; the following retry opens with flags=w if size is 0 */
          }
          done(
            reject,
            new Error(
              `The update server returned an invalid resume range (${rawRange || "missing Content-Range"}).`,
            ),
          );
          return;
        }
        if (Number.isFinite(rangeTotal) && rangeTotal > 0) total = rangeTotal;
      } else if (already > 0) {
        // The server ignored Range and sent a normal 200. This is valid: write
        // the full object from byte zero instead of appending it to the partial.
        start = 0;
        total = Number(res.headers["content-length"] || 0);
      }

      const expectedBodyBytes = Number(res.headers["content-length"] || 0);
      let received = start;
      let bodyBytes = 0;
      const out = fs.createWriteStream(destination, partial ? { flags: "a" } : { flags: "w" });
      activeOut = out;

      const failStream = (error) => {
        try {
          out.destroy();
        } catch {
          /* already closed */
        }
        if (activeOut === out) activeOut = null;
        done(reject, error instanceof Error ? error : new Error(String(error)));
      };

      out.on("error", failStream);
      res.on("data", (chunk) => {
        bodyBytes += chunk.length;
        received += chunk.length;
        if (!out.write(chunk)) res.pause();
        if (total && onProgress) onProgress(Math.min(99, Math.round((received / total) * 100)));
      });
      out.on("drain", () => res.resume());
      res.on("end", () =>
        out.end(() => {
          if (activeOut === out) activeOut = null;
          if (expectedBodyBytes > 0 && bodyBytes !== expectedBodyBytes) {
            done(
              reject,
              new Error(
                `The update download ended early (received ${bodyBytes} of ${expectedBodyBytes} bytes).`,
              ),
            );
            return;
          }
          if (total > 0 && received !== total) {
            done(
              reject,
              new Error(
                `The update download is incomplete (received ${received} of ${total} bytes).`,
              ),
            );
            return;
          }
          done(resolve, { file: destination, bytes: received });
        }),
      );
      res.on("aborted", () => failStream(new Error("The update server stopped the download early.")));
      res.on("error", failStream);
    });
    req.on("error", (error) => done(reject, error));
    req.end();
  });
}

/**
 * One-tap connection test: does this machine reach the address at all, and
 * does the secure handshake succeed? Reports the plain reason when it fails.
 */
async function probe(url) {
  const started = Date.now();
  try {
    const res = await request(url, { method: "GET", headers: { Range: "bytes=0-0" }, timeoutMs: 20000 });
    return {
      ok: res.status >= 200 && res.status < 400,
      status: res.status,
      ms: Date.now() - started,
      url: String(url),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const { code, friendly } = explainNetworkError(message);
    return { ok: false, ms: Date.now() - started, url: String(url), code, error: friendly, raw: message };
  }
}

module.exports = { getJson, head, getBinary, checkUrl, downloadTo, probe, explainNetworkError };

