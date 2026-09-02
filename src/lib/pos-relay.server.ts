/**
 * Server-side write relay for the POS database.
 *
 * Terminal staff normally hold a backend Auth session after username + PIN
 * sign-in. The relay also supports offline/compatibility operation: it proves
 * who the caller is (a signed cashier
 * session, an active terminal token, or a staff access token) and then performs
 * the write with the service key, which never reaches the browser.
 */
import { runtimeEnvValue, supabaseConfig } from "./external-supabase-config";
import type { RelayScope } from "./relay-policy.server";

export type RelayOp =
  | { kind: "insert"; table: string; rows: Record<string, unknown>[] }
  | {
      kind: "upsert";
      table: string;
      rows: Record<string, unknown>[];
      onConflict?: string;
    }
  | {
      kind: "update";
      table: string;
      values: Record<string, unknown>;
      match: Record<string, unknown>;
    }
  | { kind: "delete"; table: string; match: Record<string, unknown> };

/** Read requests the relay may answer for a proven till. */
export type RelayRead =
  | { kind: "activeShift"; storeId: string }
  | { kind: "stores" }
  | { kind: "cloudSchema" }
  | { kind: "cloudInventory" }
  | { kind: "cloudProbe"; table: string };


/**
 * Only operational tables may be written through the relay. `stores` is
 * deliberately absent: branch records are supervisor-only and supervisors
 * hold a real session, so they write directly under the row rules.
 */
export const RELAY_TABLES = new Set([
  "sales",
  "sale_items",
  "payment_transactions",
  "item_activity_logs",
  "shifts",
  "shift_sessions",
  "held_orders",
  "bookings",
  "booking_payments",
  "drawer_events",
  "stock_adjustments",
  "stock_count_drafts",
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

/** Conflict keys are owned by the server; callers cannot choose arbitrary unique columns. */
const RELAY_CONFLICT_KEYS: Readonly<Record<string, string>> = {
  sales: "id",
  sale_items: "id",
  payment_transactions: "id",
  item_activity_logs: "id",
  stock_count_drafts: "id",
};

function conflictKey(table: string): string {
  return RELAY_CONFLICT_KEYS[table] ?? "id";
}

/**
 * Names the service key may be bound under. Deployments have historically used
 * more than one, so the first one present wins rather than failing outright.
 */
const SERVICE_KEY_NAMES = [
  "POS_SUPABASE_SERVICE_ROLE_KEY",
  "POS_SERVICE_ROLE_KEY",
  "SUPABASE_POS_SERVICE_ROLE_KEY",
] as const;

/** Read the key at call time: some runtimes inject env per request. */
function readServiceKey(): string | undefined {
  for (const name of SERVICE_KEY_NAMES) {
    // Cloudflare hands secrets to the worker per request, so check what the
    // server entry captured before falling back to the process environment.
    const value = runtimeEnvValue(name) ?? process.env[name];
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
 * Answer a read for a proven till. This keeps offline/compatibility sessions
 * working when no live backend Auth session is available.
 */
export async function runRelayRead(read: RelayRead): Promise<{
  ok: boolean;
  row?: Record<string, unknown> | null;
  rows?: Record<string, unknown>[];
  error?: string;
  inventoryMode?: "deep" | "legacy";
  inventoryWarning?: string;
}> {
  if (read.kind === "cloudSchema") {
    // The PostgREST root document lists every exposed table with its columns
    // (including type and nullability), which is exactly what the till needs
    // to spot central-schema drift against the authoritative definition.
    const res = await serviceRest("");
    if (!res.ok) return { ok: false, error: (await res.text()).slice(0, 400) };
    const spec = (await res.json()) as {
      definitions?: Record<
        string,
        {
          properties?: Record<string, { type?: string; format?: string }>;
          required?: string[];
        }
      >;
    };
    const rows: Record<string, unknown>[] = [];
    for (const [table, def] of Object.entries(spec.definitions ?? {})) {
      const required = new Set(def?.required ?? []);
      for (const [column, prop] of Object.entries(def?.properties ?? {})) {
        rows.push({
          table,
          column,
          type: typeof prop?.type === "string" ? prop.type : null,
          format: typeof prop?.format === "string" ? prop.format : null,
          nullable: !required.has(column),
        });
      }
    }
    return { ok: true, rows };
  }
  if (read.kind === "cloudInventory") {
    // Deep, read-only inventory: nullability, defaults, keys, constraints,
    // indexes, triggers, row security and policies. Only available when the
    // central project carries the schema_inventory_deep helper; the caller
    // falls back to the shallow description document when it does not.
    const res = await serviceRest("rpc/schema_inventory_deep", {
      method: "POST",
      body: "{}",
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 400);
      const deepError = `HTTP ${res.status}: ${text}`;
      const helperMissing =
        res.status === 404 && (text.includes("PGRST202") || text.includes("schema_inventory_deep"));
      if (!helperMissing) return { ok: false, error: deepError };

      const legacy = await serviceRest("rpc/schema_inventory", {
        method: "POST",
        body: "{}",
      });
      if (!legacy.ok) {
        return {
          ok: false,
          error: `${deepError}; compatibility helper failed with HTTP ${legacy.status}: ${(
            await legacy.text()
          ).slice(0, 240)}`,
        };
      }
      const payload = (await legacy.json()) as Record<string, unknown> | null;
      return {
        ok: true,
        row: payload ?? {},
        inventoryMode: "legacy",
        inventoryWarning: deepError,
      };
    }
    const payload = (await res.json()) as Record<string, unknown> | null;
    return { ok: true, row: payload ?? {}, inventoryMode: "deep" };
  }

  if (read.kind === "cloudProbe") {
    // One cheap probe per table: answers "can the central database serve this
    // table right now?" with the exact PostgREST error when it cannot — the
    // difference between a missing table (schema cache), a permission problem
    // and a plain connectivity failure.
    const table = read.table.replace(/[^a-z0-9_]/gi, "");
    if (!table) return { ok: false, error: "Invalid table name" };
    try {
      const res = await serviceRest(`${table}?select=*&limit=1`);
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` };
      }
      return { ok: true, rows: [] };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Network error" };
    }
  }
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

/**
 * Execute one queued operation with service rights.
 *
 * The caller's scope is mandatory: the operation is first rewritten so it can
 * only touch the caller's own branch and only the columns their permissions
 * allow, and is refused outright otherwise.
 */
export async function runRelayOp(
  op: RelayOp,
  scope: RelayScope,
  batchIds?: Map<string, Set<string>>,
): Promise<{ ok: boolean; error?: string; code?: string }> {
  if (!RELAY_TABLES.has(op.table)) return { ok: false, error: `"${op.table}" cannot be synced` };

  const { safeAuthorizeRelayOp } = await import("./relay-policy.server");
  const decision = await safeAuthorizeRelayOp(op, scope, batchIds);
  if (!decision.ok) return { ok: false, error: decision.error, code: decision.code };
  const safeOp = decision.op;

  let res: Response;
  switch (safeOp.kind) {
    case "insert": {
      // Client-generated ids make retry an acknowledgement of the same row,
      // not a second insert that fails with a duplicate-key error.
      const keyed =
        safeOp.rows.length > 0 && safeOp.rows.every((row) => typeof row.id === "string" && row.id);
      res = await serviceRest(
        keyed ? `${safeOp.table}?on_conflict=${conflictKey(safeOp.table)}` : safeOp.table,
        {
          method: "POST",
          body: JSON.stringify(safeOp.rows),
          prefer: keyed ? "return=minimal,resolution=merge-duplicates" : "return=minimal",
        },
      );
      break;
    }
    case "upsert":
      res = await serviceRest(`${safeOp.table}?on_conflict=${conflictKey(safeOp.table)}`, {
        method: "POST",
        body: JSON.stringify(safeOp.rows),
        prefer: "return=minimal,resolution=merge-duplicates",
      });
      break;
    case "update":
      res = await serviceRest(`${safeOp.table}?${query(safeOp.match)}`, {
        method: "PATCH",
        body: JSON.stringify(safeOp.values),
        prefer: "return=minimal",
      });
      break;
    case "delete":
      res = await serviceRest(`${safeOp.table}?${query(safeOp.match)}`, {
        method: "DELETE",
        prefer: "return=minimal",
      });
      break;
  }

  if (res.ok) return { ok: true };

  // A re-pushed tender can collide with the copy the first attempt already
  // stored. The per-tender idempotency key settles it: when every row is
  // already present centrally, the push is acknowledged, not failed.
  if (
    (safeOp.kind === "upsert" || safeOp.kind === "insert") &&
    safeOp.table === "payment_transactions" &&
    res.status === 409
  ) {
    const keys = [
      ...new Set(
        safeOp.rows
          .map((r) =>
            typeof r.client_transaction_id === "string" ? r.client_transaction_id : null,
          )
          .filter((k): k is string => Boolean(k)),
      ),
    ];
    if (keys.length > 0 && keys.length === safeOp.rows.length) {
      const check = await serviceRest(
        `payment_transactions?select=id&client_transaction_id=in.(${keys
          .map((k) => encodeURIComponent(k))
          .join(",")})`,
      );
      if (check.ok) {
        const found = (await check.json()) as unknown[];
        if (found.length >= keys.length) return { ok: true };
      }
    }
  }

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
  /** app_users.user_id, when the proof carries it. */
  staffUserId?: string | null;
  /** Sign-in email, when the proof carries one. Used to find the staff record. */
  email?: string | null;
  /** Supabase Auth id, for staff signed in with email + password. */
  authUserId?: string | null;
  /** Signed claims from the proof, used as the no-round-trip fast path. */
  claims?: import("./relay-claims.server").CallerClaims | null;
};

/**
 * Establish who is pushing. Fails closed: an unproven caller writes nothing.
 *
 * A device usually presents several proofs at once. They answer different
 * questions, so all of them are read instead of stopping at the first:
 *   - a staff account or staff session says *who* is acting, with what role;
 *   - a terminal token says *where* the device physically is.
 * An administrator working on a registered till therefore stays an
 * administrator, pinned to that till's branch, instead of being downgraded to
 * an anonymous terminal with no permissions at all.
 */
export async function verifyRelayCaller(input: {
  sessionToken?: string;
  cashierToken?: string;
  terminalToken?: string;
  accessToken?: string;
}): Promise<RelayCaller> {
  let identity: RelayCaller | null = null;
  let terminalStore: string | null = null;

  // A cryptographic session record is the strongest proof: it can be revoked
  // centrally and expires when the till has been left idle.
  if (input.sessionToken) {
    const { touchSession } = await import("./session-guard.server");
    const check = await touchSession(input.sessionToken);
    if (check.ok) {
      const s = check.session;
      const kind: RelayCaller["kind"] =
        s.kind === "cashier" ? "cashier" : s.kind === "terminal" ? "terminal" : "staff";
      identity = {
        kind,
        label: s.label ?? s.staff_user_id ?? "session",
        storeId: s.branch_id ?? null,
        staffUserId: s.staff_user_id ?? null,
      };
    }
    if (!check.ok && (check.reason === "revoked" || check.reason === "idle")) {
      throw new Error("Your session has ended — please sign in again.");
    }
  }

  if (!identity && input.cashierToken) {
    const { verifyCashierSession } = await import("./pos-session.server");
    const session = verifyCashierSession(input.cashierToken);
    if (session)
      identity = { kind: "cashier", label: session.username, staffUserId: session.username };
  }

  if (input.terminalToken) {
    const res = await serviceRest(
      `terminal_tokens?id=eq.${encodeURIComponent(input.terminalToken)}&select=id,status,location_id,revoked_at`,
    );
    if (res.ok) {
      const rows = (await res.json()) as {
        status?: string;
        location_id?: string | null;
        revoked_at?: string | null;
      }[];
      const row = rows[0];
      // A revoked token (remote reset, branch removed) never proves anything.
      if (row && !row.revoked_at && (row.status === "active" || row.status === "used")) {
        terminalStore = row.location_id ?? null;
        identity ??= {
          kind: "terminal",
          label: input.terminalToken,
          storeId: terminalStore,
        };
      }
    }
  }

  // A signed-in staff account always wins the identity question, even on a
  // registered till: it is the only proof that carries a role.
  if (input.accessToken && identity?.kind !== "staff") {
    const res = await fetch(`${supabaseConfig().url}/auth/v1/user`, {
      headers: {
        apikey: supabaseConfig().key,
        Authorization: `Bearer ${input.accessToken}`,
      },
    });
    if (res.ok) {
      const user = (await res.json()) as { id?: string; email?: string };
      if (user.id) {
        // The token is proven; only now are its claims worth reading.
        const { claimsFromJwt, claimsFromPayload } = await import("./relay-claims.server");
        const claims = claimsFromJwt(input.accessToken) ?? claimsFromPayload(user);
        identity = {
          kind: "staff",
          label: user.email ?? user.id,
          email: user.email ?? null,
          authUserId: user.id,
          // The device's own branch still applies unless the account names one.
          storeId: claims?.storeId ?? terminalStore,
          claims,
        };
      }
    }
  }

  if (!identity)
    throw new Error("This till could not prove who it is — sign in again or re-activate it.");

  // Whoever is acting, the device's registered branch is the fallback.
  if (!identity.storeId && terminalStore) identity = { ...identity, storeId: terminalStore };
  return identity;
}
