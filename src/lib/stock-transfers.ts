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

const sb = supabaseExternal as unknown as SupabaseClient;

type Row = Record<string, any>;

export type TransferScope = "INTRA_GROUP" | "INTER_GROUP";

export const groupOf = (store: Store | undefined) => store?.groupId?.trim() || "default";

/** Same cluster or across clusters? Drives the warning banner and the tabs. */
export function scopeBetween(from: Store | undefined, to: Store | undefined): TransferScope {
  return groupOf(from) === groupOf(to) ? "INTRA_GROUP" : "INTER_GROUP";
}

/** Database status names map 1:1 onto the app's transfer statuses. */
const toStatus = (s: string): TransferStatus =>
  s === "approved" || s === "in_transit"
    ? "in_transit"
    : s === "received"
      ? "received"
      : s === "rejected"
        ? "rejected"
        : s === "cancelled"
          ? "cancelled"
          : "requested";

const fromStatus = (s: TransferStatus): string => (s === "requested" ? "pending" : s);

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
  items: items.map((i) => ({ productId: i.product_id, qty: Number(i.quantity) || 0 })),
  status: toStatus(r.status),
  note: r.note ?? "",
  createdBy: r.created_by ?? "",
  createdAt: r.created_at,
  updatedAt: r.updated_at ?? r.created_at,
  scope: (r.transfer_scope as TransferScope) ?? "INTRA_GROUP",
  fromGroupId: r.from_group_id ?? "default",
  toGroupId: r.to_group_id ?? "default",
});

/** Every note this branch raised or is due to receive. */
export async function loadTransfers(): Promise<StoredTransfer[]> {
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

/** Approve / reject / cancel: a plain status change with an audit stamp. */
export async function setTransferStatus(
  id: string,
  status: TransferStatus,
  who: string,
  reason?: string,
) {
  const patch: Row = { status: fromStatus(status) };
  if (status === "in_transit") {
    patch.approved_by = who;
    patch.approved_at = new Date().toISOString();
  }
  if (status === "rejected" || status === "cancelled") patch.rejected_reason = reason ?? null;
  return commitOps("Updating transfer", [
    { kind: "update", table: "stock_transfers", values: patch, match: { id } },
  ]);
}

/**
 * Receiving is the only step that touches stock, so the database does it in
 * one transaction: out of the sender, into the receiver, re-mapped across
 * clusters where needed.
 */
export async function receiveTransferInDb(id: string, who: string) {
  const res = await sb.rpc("stock_transfer_receive", { p_transfer_id: id, p_received_by: who });
  if (res.error) throw new Error(res.error.message);
}
