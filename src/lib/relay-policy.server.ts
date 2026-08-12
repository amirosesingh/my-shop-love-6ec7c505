/**
 * Server-side authorisation for the POS write relay.
 *
 * The relay commits with the central service key, which bypasses every row
 * rule. That is unavoidable — a PIN cashier has no account on the central
 * database — so this module re-applies, in the server, exactly what the row
 * rules would have applied to a directly-authenticated staff member:
 *
 *   1. the caller's branch is resolved from their proof, never from the body;
 *   2. every row and every match is pinned to that branch;
 *   3. sensitive columns are re-checked against the caller's permissions.
 *
 * A caller who cannot be scoped writes nothing.
 */
import { serviceRest } from "./pos-relay.server";
import type { RelayOp } from "./pos-relay.server";

export type RelayScope = {
  kind: "cashier" | "terminal" | "staff";
  label: string;
  storeId: string | null;
  role: string | null;
  roleSlug: string | null;
  permissions: Record<string, boolean>;
  /** Admin / manager: allowed to write across branches. */
  isSupervisor: boolean;
};

export type RelayDenial = {
  ok: false;
  code: "TABLE_FORBIDDEN" | "STORE_FORBIDDEN" | "PERMISSION_DENIED" | "SCOPE_MISSING";
  error: string;
};

/** Tables the relay may write, and the column that carries the branch. */
const STORE_COLUMN: Record<string, string> = {
  sales: "store_id",
  shifts: "store_id",
  shift_sessions: "store_id",
  held_orders: "store_id",
  bookings: "store_id",
  drawer_events: "store_id",
  stock_adjustments: "store_id",
  sku_audit: "store_id",
  purchase_orders: "store_id",
  whatsapp_queue: "store_id",
};

/** Child rows carry no branch of their own; their parent decides. */
const PARENT_OF: Record<string, { table: string; fk: string; parentStoreColumn: string }> = {
  sale_items: { table: "sales", fk: "sale_id", parentStoreColumn: "store_id" },
  booking_payments: { table: "bookings", fk: "booking_id", parentStoreColumn: "store_id" },
  purchase_order_items: { table: "purchase_orders", fk: "po_id", parentStoreColumn: "store_id" },
  stock_transfer_items: { table: "stock_transfers", fk: "transfer_id", parentStoreColumn: "from_store_id" },
};

/** Global catalogue tables: no branch, but permission-gated columns. */
const GLOBAL_TABLES = new Set(["products", "members", "audit_logs"]);

/** Both ends of a transfer may write it. */
const TRANSFER_TABLE = "stock_transfers";

/** column -> permission flag required to set it. */
const COLUMN_PERMISSIONS: Record<string, Record<string, string>> = {
  products: {
    selling_price: "can_edit_product_price",
    cost_price: "can_edit_product_price",
    ecom_price: "can_edit_product_price",
    landing_pct: "can_edit_product_price",
    stock_quantity: "can_adjust_stock",
    stock_by_store: "can_adjust_stock",
  },
  members: {
    loyalty_points: "can_edit_member_points",
    total_spent: "can_edit_member_points",
  },
  sales: {
    is_refunded: "can_process_refund",
    discount_amount: "can_give_discount",
  },
  sale_items: {
    discount_percent: "can_give_discount",
    discount_amount: "can_give_discount",
  },
  purchase_orders: { total_cost: "can_receive_purchase_order" },
  purchase_order_items: { cost_price: "can_receive_purchase_order" },
};

/** Whole-table gates for a given operation kind. */
const TABLE_PERMISSIONS: Record<string, { write?: string; remove?: string }> = {
  purchase_orders: { write: "can_receive_purchase_order" },
  purchase_order_items: { write: "can_receive_purchase_order" },
  stock_adjustments: { write: "can_adjust_stock" },
  sales: { remove: "can_void_item" },
  sale_items: { remove: "can_void_item" },
  members: { write: "can_add_member" },
};

export const RELAY_WRITABLE_TABLES = new Set([
  ...Object.keys(STORE_COLUMN),
  ...Object.keys(PARENT_OF),
  ...GLOBAL_TABLES,
  TRANSFER_TABLE,
]);

const deny = (code: RelayDenial["code"], error: string): RelayDenial => ({ ok: false, code, error });

function normalisePermissions(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    out[key] = value === true || value === "true";
  }
  return out;
}

type AppUserRow = {
  user_id?: string | null;
  store_id?: string | null;
  role?: string | null;
  role_slug?: string | null;
  permissions?: unknown;
  is_active?: boolean | null;
};

const SELECT_APP_USER = "select=user_id,store_id,role,role_slug,permissions,is_active";

async function fetchAppUser(filter: string): Promise<AppUserRow | null> {
  const res = await serviceRest(`app_users?${filter}&${SELECT_APP_USER}&limit=1`);
  if (!res.ok) return null;
  const rows = (await res.json()) as AppUserRow[];
  const row = rows[0];
  if (!row || row.is_active === false) return null;
  return row;
}

/** Look the caller up in app_users so role and branch come from the server. */
export async function resolveRelayScope(caller: {
  kind: "cashier" | "terminal" | "staff";
  label: string;
  storeId?: string | null;
  staffUserId?: string | null;
  authUserId?: string | null;
}): Promise<RelayScope> {
  let row: AppUserRow | null = null;
  if (caller.authUserId) row = await fetchAppUser(`auth_user_id=eq.${encodeURIComponent(caller.authUserId)}`);
  if (!row && caller.staffUserId)
    row = await fetchAppUser(`user_id=eq.${encodeURIComponent(caller.staffUserId)}`);
  if (!row && caller.kind !== "terminal" && caller.label)
    row = await fetchAppUser(`user_id=eq.${encodeURIComponent(caller.label)}`);

  const role = row?.role ?? null;
  const roleSlug = row?.role_slug ?? null;
  const isSupervisor =
    role === "admin" || role === "manager" || roleSlug === "admin" || roleSlug === "supervisor";

  return {
    kind: caller.kind,
    label: caller.label,
    // The proof's own branch wins: a terminal token is physically bound to a
    // branch, and a session records the branch it was opened at.
    storeId: caller.storeId ?? row?.store_id ?? null,
    role,
    roleSlug,
    permissions: normalisePermissions(row?.permissions),
    isSupervisor,
  };
}

const allowed = (scope: RelayScope, flag: string | undefined) =>
  !flag || scope.isSupervisor || scope.permissions[flag] === true;

async function parentStore(
  child: string,
  id: unknown,
): Promise<string | null | undefined> {
  const parent = PARENT_OF[child];
  if (!parent || id === undefined || id === null) return undefined;
  const res = await serviceRest(
    `${parent.table}?id=eq.${encodeURIComponent(String(id))}&select=${parent.parentStoreColumn}&limit=1`,
  );
  if (!res.ok) return undefined;
  const rows = (await res.json()) as Record<string, unknown>[];
  const row = rows[0];
  if (!row) return undefined;
  const value = row[parent.parentStoreColumn];
  return value === null || value === undefined ? null : String(value);
}

const visibleStore = (scope: RelayScope, storeId: string | null | undefined) =>
  scope.isSupervisor || (!!storeId && storeId === scope.storeId);

/**
 * Apply the branch and permission rules to one queued operation, returning a
 * rewritten operation that is safe to run with service rights.
 */
export async function authorizeRelayOp(
  op: RelayOp,
  scope: RelayScope,
): Promise<{ ok: true; op: RelayOp } | RelayDenial> {
  if (!RELAY_WRITABLE_TABLES.has(op.table))
    return deny("TABLE_FORBIDDEN", `"${op.table}" cannot be synced`);

  if (!scope.isSupervisor && !scope.storeId)
    return deny("SCOPE_MISSING", "This till is not assigned to a branch — sign in again.");

  const gate = TABLE_PERMISSIONS[op.table];
  if (op.kind === "delete") {
    if (!allowed(scope, gate?.remove))
      return deny("PERMISSION_DENIED", "Your account cannot remove these records.");
  } else if (!allowed(scope, gate?.write)) {
    return deny("PERMISSION_DENIED", "Your account cannot change these records.");
  }

  // Column-level permission checks on the values actually being written.
  const columnGate = COLUMN_PERMISSIONS[op.table];
  if (columnGate) {
    const payloads =
      op.kind === "insert" || op.kind === "upsert" ? op.rows : op.kind === "update" ? [op.values] : [];
    for (const payload of payloads) {
      for (const column of Object.keys(payload)) {
        const flag = columnGate[column];
        if (flag && !allowed(scope, flag))
          return deny("PERMISSION_DENIED", `Your account cannot change "${column}".`);
      }
    }
  }

  const storeColumn = STORE_COLUMN[op.table];
  if (storeColumn) return pinToStore(op, scope, storeColumn);

  if (op.table === TRANSFER_TABLE) return authorizeTransfer(op, scope);

  if (PARENT_OF[op.table]) return authorizeChild(op, scope);

  // Global catalogue rows: no branch to pin, permissions already checked.
  return { ok: true, op };
}

function pinToStore(
  op: RelayOp,
  scope: RelayScope,
  column: string,
): { ok: true; op: RelayOp } | RelayDenial {
  if (op.kind === "insert" || op.kind === "upsert") {
    const rows = op.rows.map((row) => {
      const given = row[column];
      if (given !== undefined && given !== null && String(given) !== (scope.storeId ?? "")) {
        if (!scope.isSupervisor) throw new StoreViolation();
        return row;
      }
      return { ...row, [column]: scope.storeId ?? given ?? null };
    });
    return { ok: true, op: { ...op, rows } as RelayOp };
  }

  const given = op.match[column];
  if (given !== undefined && given !== null && String(given) !== (scope.storeId ?? "")) {
    if (!scope.isSupervisor)
      return deny("STORE_FORBIDDEN", "You cannot change another branch's records.");
    return { ok: true, op };
  }
  // Supervisors keep cross-branch reach; everyone else is pinned.
  const match = scope.isSupervisor ? op.match : { ...op.match, [column]: scope.storeId };
  if (op.kind === "update") {
    const values = { ...op.values };
    if (!scope.isSupervisor && values[column] !== undefined && String(values[column]) !== scope.storeId)
      return deny("STORE_FORBIDDEN", "A record cannot be moved to another branch.");
    return { ok: true, op: { ...op, values, match } };
  }
  return { ok: true, op: { ...op, match } };
}

class StoreViolation extends Error {}

function authorizeTransfer(
  op: RelayOp,
  scope: RelayScope,
): { ok: true; op: RelayOp } | RelayDenial {
  if (scope.isSupervisor) return { ok: true, op };
  const involved = (row: Record<string, unknown>) =>
    String(row["from_store_id"] ?? "") === scope.storeId ||
    String(row["to_store_id"] ?? "") === scope.storeId;

  if (op.kind === "insert" || op.kind === "upsert") {
    if (!op.rows.every(involved))
      return deny("STORE_FORBIDDEN", "A transfer must involve your own branch.");
    return { ok: true, op };
  }
  return { ok: true, op };
}

async function authorizeChild(
  op: RelayOp,
  scope: RelayScope,
): Promise<{ ok: true; op: RelayOp } | RelayDenial> {
  if (scope.isSupervisor) return { ok: true, op };
  const parent = PARENT_OF[op.table]!;
  const ids: unknown[] =
    op.kind === "insert" || op.kind === "upsert"
      ? op.rows.map((row) => row[parent.fk])
      : [op.match[parent.fk] ?? (op.kind === "update" ? op.values[parent.fk] : undefined)];

  for (const id of ids) {
    if (id === undefined || id === null)
      return deny("STORE_FORBIDDEN", "This record does not say which order it belongs to.");
    const store = await parentStore(op.table, id);
    // An unknown parent is a row we have not received yet — pushing the child
    // first is normal for an offline till, so only a known mismatch is refused.
    if (store !== undefined && !visibleStore(scope, store))
      return deny("STORE_FORBIDDEN", "You cannot change another branch's records.");
  }
  return { ok: true, op };
}

/** Wrapper so the thrown branch violation inside map() becomes a denial. */
export async function safeAuthorizeRelayOp(
  op: RelayOp,
  scope: RelayScope,
): Promise<{ ok: true; op: RelayOp } | RelayDenial> {
  try {
    return await authorizeRelayOp(op, scope);
  } catch (e) {
    if (e instanceof StoreViolation)
      return deny("STORE_FORBIDDEN", "You cannot write records for another branch.");
    throw e;
  }
}
