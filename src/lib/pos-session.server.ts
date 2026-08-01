import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived signed session token for cashier terminals. Cashiers have no
 * Supabase Auth account, so privileged server functions verify this token
 * instead. It is minted only after the PIN has been checked server-side.
 */
const TTL_MS = 12 * 60 * 60 * 1000;

function secret(): Buffer {
  const raw = process.env["SETTINGS_ENCRYPTION_KEY"];
  if (!raw) throw new Error("SETTINGS_ENCRYPTION_KEY is not configured");
  return createHash("sha256").update(raw, "utf8").digest();
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

export function signCashierSession(payload: { id: string; username: string }): string {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + TTL_MS }));
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyCashierSession(
  token: string,
): { id: string; username: string } | null {
  const [body, sig] = (token || "").split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      id: string;
      username: string;
      exp: number;
    };
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return { id: parsed.id, username: parsed.username };
  } catch {
    return null;
  }
}