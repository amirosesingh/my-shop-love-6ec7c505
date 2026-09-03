/**
 * Cross-origin permission for the handful of `/api/public/*` endpoints a till
 * calls from outside the website's own origin.
 *
 * A Windows till (Electron) and an Android shell (Capacitor) are not served
 * from the company domain, so every call they make to the hosted POS is a
 * cross-origin request. Without these headers the request never reaches the
 * handler and the device reports "no answer", which looks like a dead server.
 *
 * No cookies are involved: callers prove themselves with an activation token,
 * a cashier session or a staff bearer token carried in the request body or an
 * explicit header. So the allowance is origin-wide but credential-free, and it
 * grants nothing beyond what each handler already verifies for itself.
 */

const ALLOW_HEADERS = "content-type, authorization, apikey, x-pos-token";

export function corsHeaders(request?: Request): Record<string, string> {
  const origin = request?.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin && origin !== "null" ? origin : "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Copy the allowance onto a response the handler already built. */
export function withCors(response: Response, request?: Request): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request))) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** The answer to the browser's pre-flight question. */
export function corsPreflight(request?: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
