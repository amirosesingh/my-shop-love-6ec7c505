/**
 * Branch-to-branch stock transfers, stored in the cloud database.
 *
 * A move inside one cluster ("intra-group") simply shifts quantity between
 * two branch buckets of the same catalogue row. A move across clusters
 * ("inter-group") also re-maps the item into the receiving group's catalogue,
 * which the database does atomically when the note is received.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseExternal } from "@/integrations/supabase/external-client";
import type { Store, Transfer, TransferItem, TransferKind, TransferStatus } from "./pos-types";
import { commitOps } from "./pos-db";
import { describeError } from "./notify";

const sb = supabaseExternal as unknown as SupabaseClient;

type Row = Record<string, any>;

export type TransferScope = "INTRA_GROUP" | "INTER_GROUP";

export const groupOf = (store: Store | undefined) => store?.groupId?.trim() || "default";

/** Same cluster or across clusters? Drives the warning banner and the tabs. */
export function scopeBetween(from: Store | undefined, to: Store | undefined): TransferScope {
  return groupOf(from) === groupOf(to) ? "INTRA_GROUP" : "INTER_GROUP";
}

/**
 * Database status names, including the older spellings a till upgraded
 * mid-week may still be holding. "in_transit" was an old name for dispatched.
 */
const toStatus = (s: string): TransferStatus =>
  s === "approved"
    ? "approved"
    : s === "in_transit" || s === "dispatched"
      ? "dispatched"
      : s === "received"
        ? "received"
        : s === "completed" || s === "verified"
          ? "completed"
          : s === "completed_with_discrepancy"
            ? "completed_with_discrepancy"
            : s === "rejected"
              ? "rejected"
              : s === "cancelled"
                ? "cancelled"
                : "awaiting_approval";

const fromStatus = (s: TransferStatus): string => s;

const num = (v: unknown): number | undefined =>
  v === null || v === undefined ? undefined : Number(v) || 0;

export type StoredTransfer = Transfer & {
  scope: TransferScope;
  fromGroupId: string;
  toGroupId: string;
};

const rowToTransfer = (r: Row, items: Row[]): StoredTransfer => ({
  id: r.id,
  ref: r.ref,
  kind: (r.kind as TransferKind) ?? "transfer",
  fromStoreId: r.from_store_id,
  toStoreId: r.to_store_id,
  items: items.map((i) => ({
    productId: i.product_id,
    qty: Number(i.quantity) || 0,
    approvedQty: num(i.quantity_approved),
    dispatchedQty: num(i.quantity_dispatched),
    receivedQty: num(i.quantity_received),
    verifiedQty: num(i.quantity_verified),
  })),
  status: toStatus(r.status),
  note: r.note ?? "",
  createdBy: r.created_by ?? "",
  approvedBy: r.approved_by ?? undefined,
  approvedAt: r.approved_at ?? undefined,
  dispatchedBy: r.dispatched_by ?? undefined,
  dispatchedAt: r.dispatched_at ?? undefined,
  receivedBy: r.received_by ?? undefined,
  receivedAt: r.received_at ?? undefined,
  verifiedBy: r.verified_by ?? undefined,
  verifiedAt: r.verified_at ?? undefined,
  postedAt: r.posted_at ?? undefined,
  discrepancyReason: r.discrepancy_reason ?? undefined,
  rejectedReason: r.rejected_reason ?? undefined,
  cancelledReason: r.cancelled_reason ?? undefined,
  closedAt: r.closed_at ?? undefined,
  fulfilment: r.fulfilment ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at ?? r.created_at,
  scope: (r.transfer_scope as TransferScope) ?? "INTRA_GROUP",
  fromGroupId: r.from_group_id ?? "default",
  toGroupId: r.to_group_id ?? "default",
});

/** Every note this branch raised or is due to receive. */
export async function loadTransfers(): Promise<StoredTransfer[]> {
  try {
    const heads = await sb
      .from("stock_transfers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (heads.error) throw new Error(heads.error.message);
    const rows = (heads.data as Row[] | null) ?? [];
    if (!rows.length) return [];

    const lines = await sb
      .from("stock_transfer_items")
      .select("*")
      .in("transfer_id", rows.map((r) => r.id));
    if (lines.error) throw new Error(lines.error.message);
    const byTransfer = new Map<string, Row[]>();
    for (const l of ((lines.data as Row[] | null) ?? [])) {
      const list = byTransfer.get(l.transfer_id) ?? [];
      list.push(l);
      byTransfer.set(l.transfer_id, list);
    }
    return rows.map((r) => rowToTransfer(r, byTransfer.get(r.id) ?? []));
  } catch (e) {
    // A branch with no connection still opens the transfers screen; it just
    // shows nothing rather than a crash.
    console.error("[transfers] loadTransfers failed", e);
    return [];
  }
}

export type SaveTransferInput = {
  transfer: Transfer;
  from: Store | undefined;
  to: Store | undefined;
  products: { id: string; name: string; barcode?: string; sku?: string; cost?: number }[];
};

/**
 * Write the note and its lines through the durable gate, so a transfer raised
 * with no connection is stored on the till and pushed up later.
 */
export async function saveTransfer({ transfer, from, to, products }: SaveTransferInput) {
  const head = {
    id: transfer.id,
    ref: transfer.ref,
    kind: transfer.kind,
    transfer_scope: scopeBetween(from, to),
    from_store_id: transfer.fromStoreId,
    from_store_name: from?.name ?? null,
    from_group_id: groupOf(from),
    to_store_id: transfer.toStoreId,
    to_store_name: to?.name ?? null,
    to_group_id: groupOf(to),
    status: fromStatus(transfer.status),
    note: transfer.note ?? "",
    created_by: transfer.createdBy || null,
  };
  const lines = transfer.items.map((i: TransferItem) => {
    const p = products.find((x) => x.id === i.productId);
    return {
      transfer_id: transfer.id,
      product_id: i.productId,
      barcode: p?.barcode ?? null,
      sku: p?.sku ?? null,
      product_name: p?.name ?? null,
      quantity: i.qty,
      quantity_approved: i.approvedQty ?? null,
      quantity_dispatched: i.dispatchedQty ?? null,
      unit_cost: p?.cost ?? 0,
    };
  });
  return commitOps("Saving transfer", [
    { kind: "upsert", table: "stock_transfers", rows: [head] },
    { kind: "delete", table: "stock_transfer_items", match: { transfer_id: transfer.id } },
    ...(lines.length
      ? [{ kind: "insert" as const, table: "stock_transfer_items", rows: lines }]
      : []),
  ]);
}

/**
 * Reject or cancel. Both need a reason, and the database refuses the write
 * without one, so the caller must have collected it already.
 */
export async function setTransferStatus(
  id: string,
  status: TransferStatus,
  who: string,
  reason?: string,
) {
  const patch: Row = { status: fromStatus(status) };
  if (status === "rejected") {
    patch.rejected_reason = reason ?? null;
    patch.rejected_by = who;
  }
  if (status === "cancelled") patch.cancelled_reason = reason ?? null;
  return commitOps("Updating transfer", [
    { kind: "update", table: "stock_transfers", values: patch, match: { id } },
  ]);
}

/** Quantities the approver or sender typed, keyed the way the RPCs expect. */
export type LineQty = { productId: string; qty: number };
const toLines = (lines: LineQty[] | undefined) =>
  lines?.length ? lines.map((l) => ({ product_id: l.productId, qty: Math.max(0, l.qty) })) : null;

export type RpcResult = { success: boolean; error?: string };

/**
 * Approve: the database checks the note is still waiting, records the allowed
 * quantity per line, and stamps who said yes.
 */
export async function approveTransferInDb(
  id: string,
  who: string,
  lines?: LineQty[],
): Promise<RpcResult> {
  try {
    const res = await sb.rpc("stock_transfer_approve", {
      p_transfer_id: id,
      p_approved_by: who,
      p_lines: toLines(lines),
    });
    if (res.error) throw new Error(res.error.message);
    return { success: true };
  } catch (e) {
    return { success: false, error: describeError(e, "Approving the transfer") };
  }
}

/**
 * Dispatch: stock leaves the sending branch here, in one database transaction,
 * and the note closes against whatever was actually sent.
 */
export async function dispatchTransferInDb(
  id: string,
  who: string,
  lines?: LineQty[],
): Promise<RpcResult> {
  try {
    const res = await sb.rpc("stock_transfer_dispatch", {
      p_transfer_id: id,
      p_dispatched_by: who,
      p_lines: toLines(lines),
    });
    if (res.error) throw new Error(res.error.message);
    return { success: true };
  } catch (e) {
    return { success: false, error: describeError(e, "Dispatching the transfer") };
  }
}

/**
 * Arrival only. The box is here; nothing has been counted and no stock has
 * moved onto the destination shelf yet.
 *
 * Never throws: a failure leaves the note untouched and reports why.
 */
export async function receiveTransferInDb(
  id: string,
  who: string,
  lines?: LineQty[],
): Promise<RpcResult> {
  try {
    const res = await sb.rpc("stock_transfer_receive", {
      p_transfer_id: id,
      p_received_by: who,
      p_lines: toLines(lines),
    });
    if (res.error) throw new Error(res.error.message);
    return { success: true };
  } catch (e) {
    return { success: false, error: describeError(e, "Receiving the transfer") };
  }
}

/**
 * Physical verification — the only step that puts stock on the destination
 * shelf. The database locks the note, refuses anything already posted, credits
 * the counted quantity and writes the movement, all in one transaction, so a
 * double-click or a retry can never add the delivery twice.
 */
export async function verifyTransferInDb(
  id: string,
  who: string,
  lines: LineQty[],
  reason?: string,
): Promise<RpcResult> {
  try {
    const res = await sb.rpc("stock_transfer_verify", {
      p_transfer_id: id,
      p_verified_by: who,
      p_lines: toLines(lines),
      p_reason: reason?.trim() || null,
    });
    if (res.error) throw new Error(res.error.message);
    return { success: true };
  } catch (e) {
    return { success: false, error: describeError(e, "Verifying the delivery") };
  }
}

