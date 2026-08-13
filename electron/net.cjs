/**
 * Main-process HTTP for the update feed.
 *
 * The renderer is served from http://127.0.0.1:43117, so any request to the
 * update bucket is cross-origin and the browser cancels it when the bucket
 * sends no Access-Control-Allow-Origin header. Requests made here run outside
 * the window, where CORS does not apply.
 */
const { net } = require("electron");

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

    let req;
    try {
      req = net.request({ method, url, redirect: "follow" });
    } catch (error) {
      done(reject, error instanceof Error ? error : new Error(String(error)));
      return;
    }
    for (const [key, value] of Object.entries(headers)) req.setHeader(key, value);

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
