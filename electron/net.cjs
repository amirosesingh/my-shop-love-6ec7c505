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

module.exports = { getJson, head, getBinary };
