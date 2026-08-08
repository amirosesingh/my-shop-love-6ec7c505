/**
 * Server-side write relay for the POS database.
 *
 * A cashier who signs in with a username + PIN has no account on the central
 * database, so a direct write from the till is refused by the row rules. The
 * relay accepts the same operation, proves who the caller is (a signed cashier
 * session, an active terminal token, or a staff access token) and then performs
 * the write with the service key, which never reaches the browser.
 */
import { supabaseConfig } from "./external-supabase-config";

export type RelayOp =
  | { kind: "insert"; table: string; rows: Record<string, unknown>[] }
  | {
      kind: "upsert";
      table: string;
      rows: Record<string, unknown>[];
      onConflict?: string;
    }
  | { kind: "update"; table: string; values: Record<string, unknown>; match: Record<string, unknown> }
  | { kind: "delete"; table: string; match: Record<string, unknown> };

/** Read requests the relay may answer for a proven till. */
export type RelayRead =
  | { kind: "activeShift"; storeId: string }
  | { kind: "stores" };

/** Only operational tables may be written through the relay. */
export const RELAY_TABLES = new Set([
  "sales",
  "sale_items",
  "shifts",
  "shift_sessions",
  "held_orders",
  "bookings",
  "booking_payments",
  "drawer_events",
  "stock_adjustments",
  "sku_audit",
  "audit_logs",
  "members",
  "products",
  "purchase_orders",
  "purchase_order_items",
  "stock_transfers",
  "stock_transfer_items",
  "whatsapp_queue",
  "stores",
]);

/**
 * Names the service key may be bound under. Deployments have historically used
 * more than one, so the first one present wins rather than failing outright.
 */
const SERVICE_KEY_NAMES = [
  "POS_SUPABASE_SERVICE_ROLE_KEY",
  "POS_SERVICE_ROLE_KEY",
] as const;

/** Read the key at call time: some runtimes inject env per request. */
function readServiceKey(): string | undefined {
  for (const name of SERVICE_KEY_NAMES) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

export function serviceKey(): string {
  const key = readServiceKey();
  if (!key) throw new Error("The central database service key is not configured");
  return key;
}

/** Whether this deployment can talk to the central database at all. */
export function hasServiceKey(): boolean {
  return Boolean(readServiceKey());
}

/**
 * Answer a read for a proven till. A cashier signs in with a PIN and has no
 * account on the central database, so a direct read is refused by the row
 * rules — the register would then believe no shift is open and lock itself.
 */
export async function runRelayRead(
  read: RelayRead,
): Promise<{
  ok: boolean;
  row?: Record<string, unknown> | null;
  rows?: Record<string, unknown>[];
  error?: string;
}> {
  if (read.kind === "stores") {
    const res = await serviceRest("stores?select=id,code,name,address,phone,group_id&order=name");
    if (!res.ok) return { ok: false, error: (await res.text()).slice(0, 400) };
    return { ok: true, rows: (await res.json()) as Record<string, unknown>[] };
  }
  const res = await serviceRest(
    `shifts?store_id=eq.${encodeURIComponent(read.storeId)}&status=eq.OPEN` +
      `&closed_at=is.null&order=opened_at.desc&limit=1`,
  );
  if (!res.ok) return { ok: false, error: (await res.text()).slice(0, 400) };
  const rows = (await res.json()) as Record<string, unknown>[];
  return { ok: true, row: rows[0] ?? null };
}

function serviceHeaders(): Record<string, string> {
  const key = serviceKey();
  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
  };
  // New-format sb_secret_ keys are opaque strings, not bearer JWTs.
  if (!key.startsWith("sb_")) headers["Authorization"] = `Bearer ${key}`;
  return headers;
}

/** Raw PostgREST call with the service key. */
export async function serviceRest(
  path: string,
  init: RequestInit & { prefer?: string } = {},
): Promise<Response> {
  const headers = { ...serviceHeaders(), ...((init.headers as Record<string, string>) ?? {}) };
  if (init.prefer) headers["Prefer"] = init.prefer;
  return fetch(`${supabaseConfig().url}/rest/v1/${path}`, { ...init, headers });
}

const encodeValue = (value: unknown) =>
  value === null ? "is.null" : `eq.${encodeURIComponent(String(value))}`;

const query = (match: Record<string, unknown>) =>
  Object.entries(match)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeValue(v)}`)
    .join("&");

/** Execute one queued operation with service rights. */
export async function runRelayOp(op: RelayOp): Promise<{ ok: boolean; error?: string }> {
  if (!RELAY_TABLES.has(op.table)) return { ok: false, error: `"${op.table}" cannot be synced` };

  let res: Response;
  switch (op.kind) {
    case "insert":
      res = await serviceRest(op.table, {
        method: "POST",
        body: JSON.stringify(op.rows),
        prefer: "return=minimal",
      });
      break;
    case "upsert":
      res = await serviceRest(`${op.table}?on_conflict=${op.onConflict ?? "id"}`, {
        method: "POST",
        body: JSON.stringify(op.rows),
        prefer: "return=minimal,resolution=merge-duplicates",
      });
      break;
    case "update":
      res = await serviceRest(`${op.table}?${query(op.match)}`, {
        method: "PATCH",
        body: JSON.stringify(op.values),
        prefer: "return=minimal",
      });
      break;
    case "delete":
      res = await serviceRest(`${op.table}?${query(op.match)}`, {
        method: "DELETE",
        prefer: "return=minimal",
      });
      break;
  }

  if (res.ok) return { ok: true };
  const text = await res.text();
  let message = text;
  try {
    message = (JSON.parse(text) as { message?: string }).message ?? text;
  } catch {
    /* plain text error */
  }
  return { ok: false, error: message.slice(0, 400) };
}

export type RelayCaller = {
  kind: "cashier" | "terminal" | "staff";
  label: string;
  storeId?: string | null;
};

/**
 * Establish who is pushing. Fails closed: an unproven caller writes nothing.
 */
export async function verifyRelayCaller(input: {
  cashierToken?: string;
  terminalToken?: string;
  accessToken?: string;
}): Promise<RelayCaller> {
  if (input.cashierToken) {
    const { verifyCashierSession } = await import("./pos-session.server");
    const session = verifyCashierSession(input.cashierToken);
    if (session) return { kind: "cashier", label: session.username };
  }

  if (input.terminalToken) {
    const res = await serviceRest(
      `terminal_tokens?id=eq.${encodeURIComponent(input.terminalToken)}&select=id,status,location_id`,
    );
    if (res.ok) {
      const rows = (await res.json()) as { status?: string; location_id?: string | null }[];
      const row = rows[0];
      if (row && (row.status === "active" || row.status === "used")) {
        return { kind: "terminal", label: input.terminalToken, storeId: row.location_id ?? null };
      }
    }
  }

  if (input.accessToken) {
    const res = await fetch(`${supabaseConfig().url}/auth/v1/user`, {
      headers: {
        apikey: supabaseConfig().key,
        Authorization: `Bearer ${input.accessToken}`,
      },
    });
    if (res.ok) {
      const user = (await res.json()) as { id?: string; email?: string };
      if (user.id) return { kind: "staff", label: user.email ?? user.id };
    }
  }

  throw new Error("This till could not prove who it is — sign in again or re-activate it.");
}