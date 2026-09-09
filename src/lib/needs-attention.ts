import type { Transfer } from "@/core/types/pos-types";
import type { AuthorizationRequest } from "./authorization";

export type AttentionCounts = { approvals: number; transfers: number; sync: number; total: number };

/** Derived from authoritative business state; notification read/clear markers cannot affect it. */
export function attentionCounts(input: {
  approvals?: AuthorizationRequest[];
  transfers?: Transfer[];
  syncFailures?: number;
}): AttentionCounts {
  const approvals = (input.approvals ?? []).filter((r) => r.status === "pending").length;
  const transfers = (input.transfers ?? []).filter((t) =>
    ["awaiting_approval", "received"].includes(t.status),
  ).length;
  const sync = Math.max(0, input.syncFailures ?? 0);
  return { approvals, transfers, sync, total: approvals + transfers + sync };
}
