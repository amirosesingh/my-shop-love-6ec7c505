/**
 * The authorisation framework, in one shared vocabulary.
 *
 * A sensitive action is never decided in the browser. This file only names
 * the actions, describes how a rule is shaped and works out which rule
 * applies to a branch; every check that matters happens on the server.
 */
import { GATE_RULE_KEY, type GateAction, type PosRules } from "./pos-rules";
import { normalizeSnapshot, type TicketSnapshot } from "./ticket-snapshot";

export type { TicketSnapshot } from "./ticket-snapshot";

/** How an action must be authorised. */
export type AuthMode = "none" | "pin" | "request" | "either";

export const AUTH_MODES: { value: AuthMode; label: string; blurb: string }[] = [
  { value: "none", label: "No authorisation", blurb: "Runs straight away if the person's own permissions allow it." },
  { value: "pin", label: "PIN only", blurb: "Someone with the right to authorise must type their PIN at the till." },
  { value: "request", label: "Approval request", blurb: "The action waits in the approvals queue until it is decided." },
  { value: "either", label: "Either", blurb: "The person chooses a PIN on the spot or sends it for approval." },
];

/** Every action that can be gated. */
export type AuthActionKey =
  | GateAction
  | "below_cost_sale"
  | "tax_exemption"
  | "shift_close_variance"
  | "edit_posted_stock"
  | "edit_posted_purchase"
  | "discard_draft"
  | "delete_product"
  | "member_points_adjust";

export type AuthActionDef = {
  key: AuthActionKey;
  label: string;
  blurb: string;
  group: string;
  /** Actions that only apply above a limit describe that limit here. */
  thresholdLabel?: string;
  /** Whether the action can sensibly wait for an approval decision. */
  deferrable: boolean;
};

export const AUTH_GROUPS: { id: string; label: string; blurb: string }[] = [
  { id: "sales", label: "Sales & pricing", blurb: "What may be changed on a ticket at the till." },
  { id: "cash", label: "Cash & shift", blurb: "The drawer, the count and the hand-back." },
  { id: "inventory", label: "Inventory", blurb: "Stock movements and the catalogue." },
  { id: "records", label: "Records & edits", blurb: "Changing something that has already been posted." },
  { id: "admin", label: "Administration", blurb: "Terminal and member administration." },
];

export const AUTH_ACTIONS: AuthActionDef[] = [
  { key: "refund", group: "sales", label: "Refund", blurb: "Returning money to a customer.", deferrable: false },
  { key: "void_cart", group: "sales", label: "Void the whole cart", blurb: "Abandoning a ticket in progress.", deferrable: false },
  { key: "void_line", group: "sales", label: "Void / delete a line", blurb: "Removing an item already scanned.", deferrable: false },
  { key: "reduce_qty", group: "sales", label: "Reduce a quantity", blurb: "Lowering the count on a scanned line.", deferrable: false },
  { key: "manual_discount", group: "sales", label: "Manual discount", blurb: "Any hand-typed line or bill discount.", deferrable: false },
  { key: "discount_over_limit", group: "sales", label: "Discount above the limit", blurb: "A discount larger than the cashier may give.", thresholdLabel: "Discount (%) allowed without authorisation", deferrable: false },
  { key: "price_override", group: "sales", label: "Price override", blurb: "Typing a different price at the till.", deferrable: false },
  { key: "below_cost_sale", group: "sales", label: "Sell below cost", blurb: "Selling an item under its unit cost.", deferrable: false },
  { key: "tax_exemption", group: "sales", label: "Tax exemption", blurb: "Removing tax from a ticket.", deferrable: false },
  { key: "edit_tenders", group: "sales", label: "Edit split payments", blurb: "Changing the tenders on a bill.", deferrable: false },
  { key: "no_sale_drawer", group: "cash", label: "No-sale drawer open", blurb: "Opening the drawer without a sale.", deferrable: false },
  { key: "shift_close", group: "cash", label: "Close a shift", blurb: "Running the Z-report and handing back the till.", deferrable: false },
  { key: "shift_close_variance", group: "cash", label: "Close a shift over the variance limit", blurb: "The counted cash is short or over by more than allowed.", thresholdLabel: "Variance allowed without authorisation", deferrable: false },
  { key: "stock_adjustment", group: "inventory", label: "Stock adjustment", blurb: "Recounting or writing off stock.", deferrable: true },
  { key: "delete_product", group: "inventory", label: "Delete a product", blurb: "Removing an item from the catalogue.", deferrable: true },
  { key: "edit_posted_stock", group: "records", label: "Edit a posted stock record", blurb: "Changing a count that has already been posted.", deferrable: true },
  { key: "edit_posted_purchase", group: "records", label: "Edit a received purchase", blurb: "Changing a goods-received entry after it was received.", deferrable: true },
  { key: "discard_draft", group: "records", label: "Discard a draft with items", blurb: "Throwing away a draft that already has lines on it.", deferrable: true },
  { key: "terminal_unpair", group: "admin", label: "Unpair / reset a terminal", blurb: "Sending a machine back to the activation screen.", deferrable: true },
  { key: "member_points_adjust", group: "admin", label: "Adjust member points", blurb: "Adding or removing loyalty points by hand.", deferrable: true },
];

export const AUTH_ACTION_LABEL: Record<string, string> = Object.fromEntries(
  AUTH_ACTIONS.map((a) => [a.key, a.label]),
);

export type AuthScopeType = "global" | "cluster" | "branch";

export type AuthorizationRule = {
  actionKey: AuthActionKey;
  scopeType: AuthScopeType;
  scopeId: string;
  mode: AuthMode;
  allowedRoles: string[];
  allowedUserIds: string[];
  requireReason: boolean;
  threshold: number | null;
  isEnabled: boolean;
};

export const defaultRule = (actionKey: AuthActionKey): AuthorizationRule => ({
  actionKey,
  scopeType: "global",
  scopeId: "",
  mode: "none",
  allowedRoles: ["admin", "manager"],
  allowedUserIds: [],
  requireReason: false,
  threshold: null,
  isEnabled: true,
});

const asStrings = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.map((v) => String(v)).filter(Boolean) : [];

const asMode = (raw: unknown): AuthMode =>
  raw === "pin" || raw === "request" || raw === "either" ? raw : "none";

/** Coerce an untrusted database row into a complete rule. */
export function normalizeRule(input: unknown): AuthorizationRule {
  const row = (input ?? {}) as Record<string, unknown>;
  const key = String(row["action_key"] ?? "") as AuthActionKey;
  const base = defaultRule(key);
  const scope = String(row["scope_type"] ?? "global");
  const threshold = row["threshold"];
  return {
    ...base,
    scopeType: scope === "branch" || scope === "cluster" ? scope : "global",
    scopeId: String(row["scope_id"] ?? ""),
    mode: asMode(row["mode"]),
    allowedRoles: asStrings(row["allowed_roles"]).length
      ? asStrings(row["allowed_roles"])
      : base.allowedRoles,
    allowedUserIds: asStrings(row["allowed_user_ids"]),
    requireReason: row["require_reason"] === true,
    threshold: threshold === null || threshold === undefined ? null : Number(threshold),
    isEnabled: row["is_enabled"] !== false,
  };
}

export type RuleMap = Record<string, AuthorizationRule>;

/**
 * The rule that applies to a branch: the branch row wins over the global row,
 * and an action with no row at all is not gated.
 */
export function resolveRules(rows: AuthorizationRule[], storeId: string): RuleMap {
  const out: RuleMap = {};
  AUTH_ACTIONS.forEach((a) => {
    out[a.key] = defaultRule(a.key);
  });
  rows
    .filter((r) => r.scopeType === "global")
    .forEach((r) => {
      out[r.actionKey] = r;
    });
  if (storeId) {
    rows
      .filter((r) => r.scopeType === "branch" && r.scopeId === storeId)
      .forEach((r) => {
        out[r.actionKey] = r;
      });
  }
  return out;
}

/**
 * The fall-back when the rules table cannot be read: the branch's existing
 * manager-PIN switches. An unmapped action stays gated by PIN rather than
 * quietly opening.
 */
export function rulesFromLegacy(rules: PosRules): RuleMap {
  const out: RuleMap = {};
  AUTH_ACTIONS.forEach((a) => {
    const legacyKey = (GATE_RULE_KEY as Record<string, keyof PosRules>)[a.key];
    const gated = legacyKey ? Boolean(rules[legacyKey]) : true;
    out[a.key] = { ...defaultRule(a.key), mode: gated ? "pin" : "none" };
  });
  return out;
}

/** Can this person decide requests for the action, or authorise it by PIN? */
export function canAuthorize(
  rule: AuthorizationRule | undefined,
  who: { userId?: string | null; role?: string | null },
): boolean {
  if (!rule) return false;
  const role = (who.role ?? "").toLowerCase();
  if (role && rule.allowedRoles.map((r) => r.toLowerCase()).includes(role)) return true;
  const id = (who.userId ?? "").toLowerCase();
  return !!id && rule.allowedUserIds.map((u) => u.toLowerCase()).includes(id);
}

/** Approval payloads stay flat so they survive the wire unchanged. */
export type PayloadValue = string | number | boolean | null;
export type AuthPayload = Record<string, PayloadValue>;

export type AuthorizationRequest = {
  id: string;
  actionKey: string;
  requestedBy: string;
  requestedByName: string;
  storeId: string;
  terminalId: string;
  reason: string;
  payload: AuthPayload;
  status: "pending" | "approved" | "rejected" | "cancelled" | "expired";
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  expiresAt: string;
  createdAt: string;
  /** the value the cashier asked for, and the one that was actually granted */
  requestedAmount: number | null;
  approvedAmount: number | null;
  approvedPayload: AuthPayload;
  /** the ticket the approver reviewed, and its fingerprint */
  snapshot: TicketSnapshot | null;
  snapshotHash: string;
  /** the parked ticket this request belongs to, when there is one */
  heldOrderId: string | null;
  consumedAt: string | null;
};

const numberOrNull = (raw: unknown): number | null =>
  raw === null || raw === undefined || raw === "" || !Number.isFinite(Number(raw))
    ? null
    : Number(raw);

export function normalizeRequest(input: unknown): AuthorizationRequest {
  const row = (input ?? {}) as Record<string, unknown>;
  const status = String(row["status"] ?? "pending");
  return {
    id: String(row["id"] ?? ""),
    actionKey: String(row["action_key"] ?? ""),
    requestedBy: String(row["requested_by"] ?? ""),
    requestedByName: String(row["requested_by_name"] ?? row["requested_by"] ?? ""),
    storeId: String(row["store_id"] ?? ""),
    terminalId: String(row["terminal_id"] ?? ""),
    reason: String(row["reason"] ?? ""),
    payload: (row["payload"] as AuthPayload) ?? {},
    status: (["pending", "approved", "rejected", "cancelled", "expired"].includes(status)
      ? status
      : "pending") as AuthorizationRequest["status"],
    decidedBy: (row["decided_by"] as string) ?? null,
    decidedByName: (row["decided_by_name"] as string) ?? null,
    decidedAt: (row["decided_at"] as string) ?? null,
    decisionNote: (row["decision_note"] as string) ?? null,
    expiresAt: String(row["expires_at"] ?? ""),
    createdAt: String(row["created_at"] ?? ""),
    requestedAmount: numberOrNull(row["requested_amount"]),
    approvedAmount: numberOrNull(row["approved_amount"]),
    approvedPayload: (row["approved_payload"] as AuthPayload) ?? {},
    snapshot: normalizeSnapshotRow(row["bill_snapshot"]),
    snapshotHash: String(row["snapshot_hash"] ?? ""),
    heldOrderId: (row["held_order_id"] as string) ?? null,
    consumedAt: (row["consumed_at"] as string) ?? null,
  };
}

/** An empty jsonb column means "no ticket was attached", not an empty ticket. */
function normalizeSnapshotRow(raw: unknown): TicketSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  if (Object.keys(raw as Record<string, unknown>).length === 0) return null;
  return normalizeSnapshot(raw);
}

/** The value that applies once a request is decided: the granted one wins. */
export const effectiveAmount = (r: AuthorizationRequest): number | null =>
  r.approvedAmount ?? r.requestedAmount;

