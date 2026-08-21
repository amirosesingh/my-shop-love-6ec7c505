/**
 * One place to verify callers of `/api/public/*`.
 *
 * Everything under that prefix is reachable without a signed-in session, so
 * each handler has to prove who is calling before it does any work. Doing that
 * by hand in every file means a future endpoint can ship without the check, so
 * the checks live here and handlers opt into one of them.
 *
 * Server-only: the `.server.ts` name keeps this out of browser bundles.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** A guard either lets the request through or returns the response to send. */
export type GuardResult = Response | null;

const constantTimeEquals = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

/**
 * Verifies an HMAC-SHA256 signature over the exact raw body, as used by the
 * scanners and webhooks that post to us. Returns null when the caller is good.
 */
export function verifyHmacSignature(options: {
  raw: string;
  signature: string | null;
  secret: string | undefined;
  /** Shown to the caller when the endpoint has no secret configured yet. */
  label?: string;
}): GuardResult {
  const { raw, signature, secret, label = "This endpoint" } = options;
  if (!secret) {
    return Response.json({ error: `${label} is not configured` }, { status: 503 });
  }
  const given = (signature ?? "").replace(/^sha256=/i, "").trim();
  if (!given) return new Response("Invalid signature", { status: 401 });
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  if (!constantTimeEquals(given, expected)) {
    return new Response("Invalid signature", { status: 401 });
  }
  return null;
}

/**
 * Verifies a plain shared secret sent in a header — for schedulers and internal
 * callers that cannot sign a body.
 */
export function verifySharedSecret(options: {
  request: Request;
  header: string;
  secret: string | undefined;
  label?: string;
}): GuardResult {
  const { request, header, secret, label = "This endpoint" } = options;
  if (!secret) {
    return Response.json({ error: `${label} is not configured` }, { status: 503 });
  }
  const given = (request.headers.get(header) ?? "").trim();
  if (!given || !constantTimeEquals(given, secret)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

/**
 * Marks an endpoint as deliberately open — presence-only health checks, for
 * example. Requiring an explicit call means "no guard" is always a decision
 * someone made, not something that was forgotten.
 */
export function publiclyReadable(_reason: string): GuardResult {
  return null;
}
